"""The UrbanOracle verification mail: subject, HTML body and plain-text body.

Templates are string constants rendered with string.Template, so the image
needs no template files. In the HTML body every substituted value — the
address, the link and the copy — goes through html.escape (quotes included),
so none of them can open a tag or close an attribute. The plain-text body
carries the raw values: text/plain is not interpreted, and an escaped link
(&amp;) would break.

HTML rules, chosen for mail clients rather than browsers (D4): table layout
with inline styles only (no <style> block), a 600 px column, light only (the
color-scheme metas say so; no dark variant to get wrong), system fonts only
(no web fonts, no external CSS), no images at all — the header is the
UrbanOracle wordmark as text, the way the sign-in screens draw it — a hidden
preheader, and a bulletproof button (a coloured table cell around the link).
The palette is UrbanOracle's: #1A1814 ink, #5C574E secondary text, and the
product's 深紺 #16305C for the wordmark, the button (white label, 12:1) and the
fallback link.

The copy is Parti's email copy (backend/verification_email_templates.py
@origin/main) with the spec's substitutions only (F6): "Parti" -> "UrbanOracle",
the subject and the footer line — and, per the review amendment A1, the
product's own term サインイン where Parti said ログイン (the English already
says "sign in"). The HTML below is mail markup: one element
per line, each with its inline style, so its lines run long on purpose.
"""

import html
from dataclasses import dataclass
from string import Template

_FONT = "Arial, Helvetica, 'Hiragino Sans', 'Noto Sans JP', Meiryo, sans-serif"
_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

INK = "#1A1814"
MUTED = "#5C574E"
ACCENT = "#16305C"

COPY: dict[str, dict[str, str]] = {
    "ja": {
        "subject": "UrbanOracle のメールアドレスを確認してください",
        "preheader": "ボタンを1回押すと登録が完了します。",
        "h1": "メールアドレスの確認",
        "lead": (
            "UrbanOracle にご登録いただきありがとうございます。"
            "下のボタンを押すと、次のメールアドレスの確認が完了します。"
        ),
        "button": "メールアドレスを確認する",
        "under": "UrbanOracle を開いたままの画面は、確認が終わると自動で次へ進みます。",
        "note1_title": "有効期限について",
        "note1_body": (
            "リンクには有効期限があります。期限が切れた場合は、"
            "UrbanOracle にサインインすると新しいリンクを受け取れます。"
        ),
        "note2_title": "心当たりがない場合",
        "note2_body": "このメールは削除してください。何もしなければ、メールアドレスは確認されません。",
        "note3_title": "ボタンが押せない場合",
        "note3_body": "次のURLをブラウザに貼り付けてください。",
        "footer1": "UrbanOracle は DXA Labs のサービスです。",
        "footer2": (
            "このメールに返信すると、DXA Labs のお問い合わせ窓口（contact@dxalabs.com）に届きます。"
        ),
        "footer3": "送信元: noreply@send.dxalabs.com",
    },
    "en": {
        "subject": "Confirm your email for UrbanOracle",
        "preheader": "One click and you're in.",
        "h1": "Confirm your email address",
        "lead": (
            "Thanks for signing up for UrbanOracle. "
            "Press the button below to confirm this email address:"
        ),
        "button": "Confirm email address",
        "under": "Any UrbanOracle screen you left open moves on by itself once you confirm.",
        "note1_title": "About the link",
        "note1_body": "This link expires. If it does, sign in to UrbanOracle to get a new one.",
        "note2_title": "Didn't sign up?",
        "note2_body": "Delete this email. If you do nothing, the address stays unconfirmed.",
        "note3_title": "Button not working?",
        "note3_body": "Paste this URL into your browser:",
        "footer1": "UrbanOracle is a DXA Labs service.",
        "footer2": "Replies to this email reach DXA Labs support (contact@dxalabs.com).",
        "footer3": "Sent from noreply@send.dxalabs.com",
    },
}

_NOTE = (
    '<p style="margin:14px 0 0 0;font-family:__FONT__;font-size:13px;line-height:1.7;'
    'color:__MUTED__;"><strong style="color:__INK__;">$title</strong><br>$body</p>'
)

_HTML = Template(
    """<!DOCTYPE html>
<html lang="$lang">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>$subject</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
<span style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f4f4f4;">$preheader</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
<tr>
<td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr>
<td style="background-color:#ffffff;border:1px solid #dcdcdc;border-radius:8px;padding:32px 32px 28px 32px;font-family:__FONT__;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="font-family:__FONT__;font-size:26px;font-weight:700;letter-spacing:-0.01em;line-height:1.2;color:__ACCENT__;padding-bottom:12px;border-bottom:1px solid __INK__;">UrbanOracle</td>
<td align="right" style="font-family:__FONT__;font-size:11px;letter-spacing:0.08em;line-height:1.2;color:__MUTED__;padding-bottom:12px;border-bottom:1px solid __INK__;vertical-align:bottom;">DXA LABS</td>
</tr>
</table>
<h1 style="margin:28px 0 12px 0;font-family:__FONT__;font-size:24px;line-height:1.35;font-weight:700;color:__INK__;">$h1</h1>
<p style="margin:0 0 16px 0;font-family:__FONT__;font-size:15px;line-height:1.8;color:#33302A;">$lead</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="background-color:#f5f5f5;border:1px solid #e5e5e5;border-radius:4px;padding:12px 16px;font-family:__MONO__;font-size:14px;line-height:1.5;color:__INK__;word-break:break-all;">$email</td>
</tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
<tr>
<td align="center" bgcolor="__ACCENT__" style="background-color:__ACCENT__;border-radius:4px;">
<a href="$link" target="_blank" style="display:block;padding:17px 24px;font-family:__FONT__;font-size:16px;font-weight:700;line-height:1.3;color:#ffffff;text-decoration:none;border-radius:4px;">$button</a>
</td>
</tr>
</table>
<p style="margin:12px 0 0 0;text-align:center;font-family:__FONT__;font-size:13px;line-height:1.7;color:__MUTED__;">$under</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
<tr>
<td style="height:1px;line-height:1px;font-size:1px;background-color:#e5e5e5;">&nbsp;</td>
</tr>
</table>
__NOTE1__
__NOTE2__
__NOTE3__
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
<tr>
<td style="background-color:#fafafa;border:1px solid #e5e5e5;border-radius:4px;padding:12px 14px;font-family:__MONO__;font-size:12px;line-height:1.6;color:__ACCENT__;word-break:break-all;"><a href="$link" target="_blank" style="color:__ACCENT__;text-decoration:underline;word-break:break-all;">$link</a></td>
</tr>
</table>
</td>
</tr>
<tr>
<td align="center" style="padding:20px 12px 0 12px;font-family:__FONT__;font-size:12px;line-height:1.7;color:__MUTED__;">$footer1<br>$footer2<br>$footer3</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
""".replace("__NOTE1__", _NOTE.replace("$title", "$note1_title").replace("$body", "$note1_body"))
    .replace("__NOTE2__", _NOTE.replace("$title", "$note2_title").replace("$body", "$note2_body"))
    .replace("__NOTE3__", _NOTE.replace("$title", "$note3_title").replace("$body", "$note3_body"))
    .replace("__FONT__", _FONT)
    .replace("__MONO__", _MONO)
    .replace("__ACCENT__", ACCENT)
    .replace("__MUTED__", MUTED)
    .replace("__INK__", INK)
)

_TEXT = Template(
    """$preheader

$h1

$lead
$email

$button:
$link

$under

$note1_title
$note1_body

$note2_title
$note2_body

$note3_title
$note3_body
$link

--
$footer1
$footer2
$footer3
"""
)


@dataclass(frozen=True)
class RenderedEmail:
    subject: str
    html: str
    text: str


def render_verification_email(lang: str, *, email: str, link: str) -> RenderedEmail:
    """Render the mail for `lang` ("ja" or "en"), addressed to `email`, carrying `link`."""
    if lang not in COPY:
        raise ValueError(f"unsupported language: {lang!r}")
    copy = COPY[lang]
    values = {**copy, "lang": lang, "email": email, "link": link}
    escaped = {key: html.escape(value, quote=True) for key, value in values.items()}
    return RenderedEmail(
        subject=copy["subject"],
        html=_HTML.substitute(escaped),
        text=_TEXT.substitute(values),
    )
