"""The verification mail's templates (Stage 2, R-B10).

Both languages render; every value substituted into the HTML is escaped (the
plain-text part carries the raw values); the HTML is light only and carries no
image, no external stylesheet, no web font and no script. The copy is Parti's
email COPY with the spec's substitutions only (F6): "Parti" -> "UrbanOracle",
the subject and the footer line. The button, the fallback link and the wordmark
colour are UrbanOracle's #16305C (the delta); the button text is white.

The module is imported inside each test, so that before it exists each test
fails on its own line.
"""

import html
import importlib
import importlib.util
import re

import pytest

COPY = {
    "ja": [
        "ボタンを1回押すと登録が完了します。",
        "メールアドレスの確認",
        "UrbanOracle にご登録いただきありがとうございます。"
        "下のボタンを押すと、次のメールアドレスの確認が完了します。",
        "メールアドレスを確認する",
        "UrbanOracle を開いたままの画面は、確認が終わると自動で次へ進みます。",
        "有効期限について",
        "リンクには有効期限があります。期限が切れた場合は、"
        "UrbanOracle にログインすると新しいリンクを受け取れます。",
        "心当たりがない場合",
        "このメールは削除してください。何もしなければ、メールアドレスは確認されません。",
        "ボタンが押せない場合",
        "次のURLをブラウザに貼り付けてください。",
        "UrbanOracle は DXA Labs のサービスです。",
        "このメールに返信すると、DXA Labs のお問い合わせ窓口（contact@dxalabs.com）に届きます。",
        "送信元: noreply@send.dxalabs.com",
    ],
    "en": [
        "One click and you're in.",
        "Confirm your email address",
        "Thanks for signing up for UrbanOracle. Press the button below to confirm this email address:",
        "Confirm email address",
        "Any UrbanOracle screen you left open moves on by itself once you confirm.",
        "About the link",
        "This link expires. If it does, sign in to UrbanOracle to get a new one.",
        "Didn't sign up?",
        "Delete this email. If you do nothing, the address stays unconfirmed.",
        "Button not working?",
        "Paste this URL into your browser:",
        "UrbanOracle is a DXA Labs service.",
        "Replies to this email reach DXA Labs support (contact@dxalabs.com).",
        "Sent from noreply@send.dxalabs.com",
    ],
}
SUBJECT = {
    "ja": "UrbanOracle のメールアドレスを確認してください",
    "en": "Confirm your email for UrbanOracle",
}
LINK = "https://urbanoracle.dxalabs.com/auth/action?mode=verifyEmail&oobCode=ABC-123&lang={lang}"


def _templates():
    assert importlib.util.find_spec("services.verification_email_templates") is not None, (
        "backend/services/verification_email_templates.py does not exist yet (Stage 2 adds it)"
    )
    return importlib.import_module("services.verification_email_templates")


@pytest.mark.parametrize("lang", ["ja", "en"])
def test_rb10_each_language_renders_its_copy_verbatim(lang):
    t = _templates()
    link = LINK.format(lang=lang)

    mail = t.render_verification_email(lang, email="someone@example.com", link=link)

    assert mail.subject == SUBJECT[lang]
    assert f'<html lang="{lang}">' in mail.html
    for line in COPY[lang]:
        assert html.escape(line, quote=True) in mail.html, f"HTML lacks: {line}"
        assert line in mail.text, f"text lacks: {line}"
    assert "someone@example.com" in mail.html and "someone@example.com" in mail.text
    assert html.escape(link, quote=True) in mail.html, "the link, escaped, in the HTML"
    assert mail.html.count(f'href="{html.escape(link, quote=True)}"') == 2, "button + fallback"
    assert link in mail.text, "the link, raw, in the text part"
    assert ">UrbanOracle<" in mail.html and ">DXA LABS<" in mail.html, "the header row"
    assert "Parti" not in mail.html and "Parti" not in mail.text and "parti" not in mail.html
    assert "max-width:600px" in mail.html


@pytest.mark.parametrize("lang", ["ja", "en"])
def test_rb10_light_only_no_image_no_external_css_font_or_script(lang):
    t = _templates()
    mail = t.render_verification_email(lang, email="a@example.com", link=LINK.format(lang=lang))
    assert '<meta name="color-scheme" content="light">' in mail.html
    assert '<meta name="supported-color-schemes" content="light">' in mail.html
    lowered = mail.html.lower()
    for banned in (
        "<img", "<link", "@import", "url(", "fonts.googleapis", "@font-face", "<script", "<style",
    ):
        assert banned not in lowered, f"the HTML carries {banned!r}"


def test_rb10_button_link_and_wordmark_are_the_products_navy_on_white():
    t = _templates()
    mail = t.render_verification_email("ja", email="a@example.com", link=LINK.format(lang="ja"))
    # The bulletproof button: a #16305C cell with a white, bold label.
    button = re.search(r'<td[^>]*bgcolor="#16305C"[^>]*>\s*<a href="[^"]+"[^>]*>', mail.html, re.I)
    assert button, "no #16305C button cell wrapping the link"
    assert "color:#ffffff" in button.group(0).lower()
    # The fallback URL box and its link are the same navy; the wordmark too.
    assert mail.html.lower().count("color:#16305c") >= 3, "fallback box + fallback link + wordmark"
    wordmark = re.search(r"<td[^>]*>UrbanOracle</td>", mail.html)
    assert wordmark and "#16305C" in wordmark.group(0)
    for stray in ("#171717", "#1f4e79"):
        assert stray not in mail.html.lower(), f"Parti's {stray} survived the port"
    assert "arial, helvetica, 'hiragino sans', 'noto sans jp', meiryo, sans-serif" in mail.html.lower()


def test_rb10_every_substituted_value_is_escaped_in_html_raw_in_text():
    t = _templates()
    email = "a\"b<c>&d'@example.com"
    link = (
        'https://urbanoracle.dxalabs.com/auth/action?mode=verifyEmail&oobCode=X"><script>x</script>'
        "&lang=ja"
    )

    mail = t.render_verification_email("ja", email=email, link=link)

    assert "<script>" not in mail.html
    assert "<c>" not in mail.html
    assert html.escape(email, quote=True) in mail.html
    assert html.escape(link, quote=True) in mail.html
    assert email in mail.text and link in mail.text


def test_rb10_an_unknown_language_is_refused():
    t = _templates()
    with pytest.raises(ValueError):
        t.render_verification_email("fr", email="a@example.com", link="https://urbanoracle.dxalabs.com")
