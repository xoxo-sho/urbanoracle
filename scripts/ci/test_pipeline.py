"""Pipeline guards: the image that ships is the image CI built and smoked.

Run: python -m pytest -q -p no:cacheprovider scripts/ci/test_pipeline.py
(ci.yml, job `backend`, step "Pipeline guards"). Needs PyYAML
(backend/requirements-dev.txt).

The rule these encode (RECON 2026-11-uo-build-once):
  - CI builds the production image once, smokes it, and on a main deploy
    pushes that same image and outputs its digest;
  - deploy.yml migrates and deploys that digest and builds nothing itself;
  - pull_request runs build and smoke but never push.

Each test parses the workflow YAML; nothing here calls GitHub or GCP.
"""

from __future__ import annotations

import pathlib
import re

import pytest
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"

# The five values the production bundle is built with (deploy.yml passed them
# to Cloud Build until this change) and the secret each comes from.
PRODUCTION_ARGS = {
    "NEXT_PUBLIC_FIREBASE_API_KEY": "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN": "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID": "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID": "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_SITE_URL": "NEXT_PUBLIC_SITE_URL",
}
DIGEST_OUTPUT = "needs.ci.outputs.image_digest"
BUILD_MARKERS = re.compile(r"\bdocker\s+(?:buildx\s+)?build\b|\bbuildx\s+build\b")


def load(name: str) -> dict:
    with open(WORKFLOWS / name, encoding="utf-8") as fh:
        doc = yaml.safe_load(fh)
    # YAML 1.1 reads the bare key `on` as the boolean True.
    if True in doc:
        doc["on"] = doc.pop(True)
    return doc


CI = load("ci.yml")
DEPLOY = load("deploy.yml")


def run_of(step: dict) -> str:
    return step.get("run") or ""


def is_build(step: dict) -> bool:
    return "docker/build-push-action" in (step.get("uses") or "") or bool(BUILD_MARKERS.search(run_of(step)))


def is_push(step: dict) -> bool:
    uses = step.get("uses") or ""
    with_ = step.get("with") or {}
    return (
        bool(re.search(r"\bdocker\s+push\b|--push\b|\bcrane\s+push\b", run_of(step)))
        or ("docker/build-push-action" in uses and str(with_.get("push", "false")).lower() == "true")
    )


def is_smoke(step: dict) -> bool:
    return "image-smoke.sh" in run_of(step)


def image_job() -> dict:
    return CI["jobs"]["image"]


def deploy_job() -> dict:
    return DEPLOY["jobs"]["deploy"]


def resolve(value: str, *envs: dict) -> str:
    """Expand $NAME / ${NAME} from the given env maps, repeatedly."""
    merged: dict[str, str] = {}
    for env in envs:
        merged.update({k: str(v) for k, v in (env or {}).items()})
    for _ in range(6):
        new = re.sub(
            r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)",
            lambda m: merged.get(m.group(1) or m.group(2), m.group(0)),
            value,
        )
        if new == value:
            break
        value = new
    return value


def shell_assignments(script: str) -> dict:
    """NAME=value lines of a run script (the value with its quotes removed)."""
    out = {}
    for line in script.splitlines():
        m = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$', line)
        if m:
            out[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return out


def image_flag(script: str) -> str | None:
    m = re.search(r'--image[= ]+"?([^"\s\\]+)', script)
    return m.group(1) if m else None


# ---------------------------------------------------------------------------


def test_no_workflow_runs_cloud_build():
    for wf_name, wf in (("deploy.yml", DEPLOY), ("ci.yml", CI)):
        for job_name, job in wf["jobs"].items():
            for step in job.get("steps", []):
                script = run_of(step)
                assert "cloudbuild-submit.sh" not in script, f"{wf_name}:{job_name} runs cloudbuild-submit.sh"
                assert not re.search(r"gcloud\s+builds\s+submit", script), f"{wf_name}:{job_name} runs gcloud builds submit"
                assert "cloudbuild.yaml" not in script, f"{wf_name}:{job_name} references cloudbuild.yaml"


def test_deploy_job_contains_no_image_build():
    for step in deploy_job().get("steps", []):
        assert not is_build(step), f"deploy job builds an image in step {step.get('name')!r}"


def test_deploy_calls_ci_with_push_input_secrets_and_oidc():
    ci_job = DEPLOY["jobs"]["ci"]
    assert ci_job.get("uses") == "./.github/workflows/ci.yml"
    assert (ci_job.get("with") or {}).get("push_image") is True, "deploy.yml must call ci.yml with push_image: true"
    secrets = ci_job.get("secrets")
    if secrets != "inherit":
        missing = [s for s in PRODUCTION_ARGS.values() if f"secrets.{s}" not in str((secrets or {}).get(s, ""))]
        assert not missing, f"deploy.yml does not pass these secrets to ci.yml: {missing}"
    perms = ci_job.get("permissions") or {}
    assert perms.get("id-token") == "write", "the called image job needs id-token: write from its caller"

    call = CI["on"].get("workflow_call") or {}
    push_input = (call.get("inputs") or {}).get("push_image") or {}
    assert push_input.get("type") == "boolean" and push_input.get("default") is False, (
        "ci.yml must declare workflow_call input push_image: boolean, default false"
    )
    declared = set((call.get("secrets") or {}).keys())
    assert set(PRODUCTION_ARGS.values()) <= declared or secrets == "inherit", (
        f"ci.yml workflow_call must declare the production secrets, missing {set(PRODUCTION_ARGS.values()) - declared}"
    )
    outputs = call.get("outputs") or {}
    assert "jobs.image.outputs.digest" in str((outputs.get("image_digest") or {}).get("value", "")), (
        "ci.yml must output image_digest from the image job"
    )


def test_migrate_and_deploy_take_the_digest_ci_pushed():
    job = deploy_job()
    needs = job.get("needs")
    assert needs == "ci" or (isinstance(needs, list) and "ci" in needs), "deploy job must need ci"
    found = {"gcloud run jobs deploy": False, "gcloud run deploy": False}
    for step in job["steps"]:
        script = run_of(step)
        for cmd in found:
            # `gcloud run deploy` is a prefix-free match only when not followed by "jobs"
            pattern = r"gcloud\s+run\s+jobs\s+deploy" if "jobs" in cmd else r"gcloud\s+run\s+deploy\b"
            if not re.search(pattern, script):
                continue
            ref = image_flag(script)
            assert ref, f"{cmd}: no --image flag"
            expanded = resolve(ref, DEPLOY.get("env"), job.get("env"), step.get("env"), shell_assignments(script))
            assert "@" in expanded and DIGEST_OUTPUT in expanded, (
                f"{cmd} --image {ref!r} expands to {expanded!r}: not <repo>@<digest from {DIGEST_OUTPUT}>"
            )
            assert "GITHUB_SHA" not in expanded and "github.sha" not in expanded, f"{cmd} still deploys a tag"
            found[cmd] = True
    assert all(found.values()), f"missing deploy commands: {[k for k, v in found.items() if not v]}"


def test_deploy_checks_the_new_revision_runs_the_pushed_digest():
    job = deploy_job()
    checks = [s for s in job["steps"] if "imageDigest" in run_of(s)]
    assert checks, "no step reads the new revision's status.imageDigest"
    for step in checks:
        expanded = resolve(run_of(step), DEPLOY.get("env"), job.get("env"), step.get("env"))
        assert DIGEST_OUTPUT in expanded, (
            f"step {step.get('name')!r} reads imageDigest but does not compare it with {DIGEST_OUTPUT}"
        )


def test_push_steps_run_only_when_called_for_a_main_deploy():
    job = image_job()
    pushes = [s for s in job["steps"] if is_push(s)]
    assert pushes, "the CI image job never pushes the image it smoked"
    auths = [s for s in job["steps"] if "google-github-actions/auth" in (s.get("uses") or "")]
    for step in pushes + auths:
        cond = str(step.get("if", ""))
        assert "inputs.push_image" in cond and "refs/heads/main" in cond, (
            f"step {step.get('name') or step.get('uses')!r} is not gated on inputs.push_image and refs/heads/main: if={cond!r}"
        )
    for name, other in CI["jobs"].items():
        if name != "image":
            assert not any(is_push(s) for s in other.get("steps", [])), f"job {name} pushes an image"
    assert "pull_request" in CI["on"], "ci.yml must still build and smoke on pull_request"


def test_pushed_image_is_the_smoked_image_with_no_rebuild_in_between():
    steps = image_job()["steps"]
    builds = [i for i, s in enumerate(steps) if is_build(s)]
    smokes = [i for i, s in enumerate(steps) if is_smoke(s)]
    pushes = [i for i, s in enumerate(steps) if is_push(s)]
    assert len(builds) == 1, f"the image job must build exactly once, found {len(builds)} build steps"
    assert smokes and pushes, "the image job needs smoke steps and a push step"
    assert builds[0] < min(smokes), "the build must come before the smoke"
    assert min(pushes) > max(smokes), "the push must come after every smoke step"

    build = steps[builds[0]]
    assert str((build.get("with") or {}).get("push", "false")).lower() != "true", "the build step must not push"
    tags = str((build.get("with") or {}).get("tags", ""))
    m = re.search(r"env\.([A-Za-z_][A-Za-z0-9_]*)", tags)
    assert m, f"build tags {tags!r} must name an env var shared with the smoke and push steps"
    var = m.group(1)
    for i in smokes + pushes:
        script = run_of(steps[i])
        assert f"${var}" in script or f"${{{var}}}" in script or f"env.{var}" in script, (
            f"step {steps[i].get('name')!r} does not use the built image ${var}"
        )
    push_script = "\n".join(run_of(steps[i]) for i in pushes)
    assert "{{.Id}}" in push_script and "config" in push_script, (
        "the push step must compare the pushed manifest's config digest with the smoked image ID"
    )
    outputs = image_job().get("outputs") or {}
    assert "digest" in outputs, "the image job must output the pushed digest"


def test_ci_image_build_uses_production_build_args_on_a_deploy():
    job = image_job()
    steps = job["steps"]
    build = next(s for s in steps if is_build(s))
    with_ = build.get("with") or {}
    args = {}
    for line in str(with_.get("build-args", "")).splitlines():
        if "=" in line:
            k, v = line.strip().split("=", 1)
            args[k] = v
    for arg, secret in PRODUCTION_ARGS.items():
        assert f"secrets.{secret}" in args.get(arg, ""), f"build-arg {arg} does not take secrets.{secret} on a deploy build"
        assert "inputs.push_image" in args.get(arg, "") or "env.PUSH" in args.get(arg, ""), (
            f"build-arg {arg}: the production value must be selected by the deploy condition"
        )
    sha = args.get("NEXT_PUBLIC_BUILD_SHA", "")
    assert "github.sha" not in sha and "short_sha" in sha, (
        f"NEXT_PUBLIC_BUILD_SHA={sha!r}: must be the 7-char image tag, as Cloud Build used"
    )
    assert any("GITHUB_SHA::7" in run_of(s) and "short_sha" in run_of(s) for s in steps), "no step computes short_sha"
    assert str(with_.get("platforms")) == "linux/amd64"
    assert str(with_.get("provenance")).lower() == "false" and str(with_.get("sbom")).lower() == "false", (
        "provenance/SBOM attestations would turn the pushed image into an index; the registry holds single manifests"
    )

    idx_build = steps.index(build)
    guards = [i for i, s in enumerate(steps) if "check-build-args.sh" in run_of(s)]
    assert guards and guards[0] < idx_build, "the degenerate-value guard must run before the deploy build"

    bundle = next(s for s in steps if is_smoke(s) and " bundle " in f" {run_of(s)} ")
    env = {k: str(v) for k, v in (bundle.get("env") or {}).items()}
    assert "SKIP_REAL_CONFIG" in env and "0" in env["SKIP_REAL_CONFIG"], (
        "verify-bundle must run in real-config mode on a deploy build, as cloudbuild.yaml's verify-bundle step did"
    )
    assert "secrets.NEXT_PUBLIC_FIREBASE_APP_ID" in env.get("EXPECT_APP_ID", ""), "EXPECT_APP_ID must pin the real appId"


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__, "-q"]))
