# UrbanOracle — Design Phase 1 Spec v1

## 0. 前提と原則

トーン: editorial・atlas。The Economist / Monocle / 古典的地図帳 / 質の高い年次レポートの系譜。密度で professional-grade を出す(余白で高級感を出さない)。地図は計器であり玩具でない。

ターゲット: 不動産投資家・デベロッパー。上振れ(地価トレンド・人口・アクセス)と下振れ(災害 PML ¥)を同一意思決定面で見る。数字の正確さ・出典・精度が信頼の通貨。

独自性の視覚的表現: 上振れ×下振れの対称を、色軸・レイアウト・hero の全てに貫通させる。どちらかが装飾でどちらかが本体、にしない。

UI 言語: 日本語のみ(現行踏襲)。light/dark 両対応。

## 1. Step Zero: フォント配線の修復(実装の前提)

現状 @theme inline の --font-sans: var(--font-sans) が自己参照で undefined、Geist Sans が実際には適用されていない。これを最初に直す:
- --font-sans → var(--font-geist-sans) に修正。
- --font-mono → var(--font-geist-mono)(現状正しい、維持)。
- --font-heading → 新規の見出しフォント変数を指す(§3)。
この修復なしに見出しフォント作業は壊れた土台に乗る。

## 2. カラーシステム(意味論的、per-mode)

地色(atlas):
- Light = cream(現行の hue 265 の青みから atlas cream へ意図的にシフト)。オフホワイト〜生成り。
- Dark = ink(現行 dark 継承、インク寄り)。§10(c) で warmer atlas-dark を検討。

上振れ/下振れ 対称2色軸(コントラスト一致ペア、番号でなくコントラストを揃える。measured):

Light mode 主推奨ペア(both AAA、~10:1、well-matched):
- 深紺(上振れ)= #16305C(cream で 12.19:1)
- 深銅(下振れ)= #6E2417(cream で 10.19:1)

Dark mode(light tints、両方 AAA text):
- 深紺(上振れ)= #8AABD6(ink で 7.87:1)
- 深銅(下振れ)= #E9A387(ink で 8.92:1)

各軸に text/UI/fill の階調を持たせる。AA 4.5:1 段と 3:1(UI/large)段も per-mode で定義する。OKLCH 解済み参考値(cream / ink それぞれ AAA・AA・UI):
- 深紺 cream: #0054A5(7:1) / #2272CD(4.5:1) / #4491EF(3:1)
- 深銅 cream: #A02905(7:1) / #C34B2D(4.5:1) / #E66B4C(3:1)
- 深紺 ink: #54A1FF(7:1) / #2F7DDA(4.5:1) / #0660BA(3:1)
- 深銅 ink: #F77A5B(7:1) / #CF5739(4.5:1) / #AE3819(3:1)

規律:
- 色は意味にのみ使う。装飾色を排する。
- 上振れ=深紺、下振れ=深銅 以外のデータは無彩色階調。
- chart-1..5 は無彩色 or 上記2軸の階調に置き換え(現行の任意色を排す。§10(b) で脱色度を確定)。

H項と衝突する現行トークンの除去:
- glass トークン(--glass-bg/-border/-highlight、backdrop-filter: blur(24px) saturate(1.4))を全除去。glassmorphism は H項。

## 3. タイポグラフィ

見出し(H1/H2/hero/セクション見出しのみ):
- 和文 = Zen Old Mincho 700(明朝、editorial の権威)。見出し限定 subset(font-display: swap)。
- 欧文 = Source Serif 4 700(Latin subset ≈ 11.1KB)。
- 和欧混植: 見出し内で和欧が混ざる箇所は両者を併用(font stack で欧文優先→和文 fallback)。

Zen Old Mincho 選定の根拠(recon の重量測定を踏まえた確定判断、推測ではない): 実測で Zen Old Mincho は margin tier で最も重い明朝(Tier B 199.7KB / Tier D 636.2KB、Noto Serif JP は 170.7KB / 453.7KB で全字カバー)。それでも Zen Old Mincho を採る理由は (1) 見出し限定 subset のため実運用の字種は Tier A〜C 帯(≈125–313KB)に収まり Tier D の重量は該当しない、(2) Parallel City の Zen Kaku Gothic New とペア設計=DXA 内の Zen ファミリ一貫性、(3) editorial の権威。字種欠落が見出しコピーで問題になった場合のみ Noto Serif JP に切替(全字カバーが担保)。

本文・データ・数値:
- Geist Sans(§1 で配線修復後)。
- 数値カラム = Geist Mono(等幅、端末の信頼感)。

規律: 明朝は大きい字でのみ(見出し)。小サイズ本文・データに明朝を使わない(画面可読性)。
subset 対象文字: 見出し・ラベルに実際に出る和文(セクション見出し、区名、「アクセスを審査中です」「データなし」等)+ 常用かな + 上位漢字(recon の Tier C 基準)。

## 4. LP(公開 /)

hero(最初の一屏): 上振れ×下振れの対称を spread 構図で。
- 中央に対象エリア、深紺側に上振れ、深銅側に下振れ。
- 実データの片鱗(mockup でない): 今は changeRate(上振れ、符号付き%)× safety/level(下振れ)を 23 区で。両方 real・per-ward・捏造なし。Stage 4.5 後に下振れを pml_pct(真の value-at-risk)に差し替え。
- CTA 直下に identity メッセージ「一つのアカウントで DXA Labs の全プロダクトにアクセスできます」。

LP 全体: editorial の密度を体現(marketing 的抽象でなく)。セクション = hero / capabilities(上振れ×下振れの説明)/ data source credibility(REINFOLIB・e-Stat・DisasterShield の出典明示)/ footer。密度で prof-grade。

## 5. routing の4状態

- 未認証 → /login
- 認証済み・inactive(pending)→ /pending(審査中画面、§7)
- 認証済み・active → /app(ダッシュボード、現行 / から移設)
- 公開 → /(LP)
/app は 403+{"status":"pending_activation"} を検出したら /pending へ、401 は /login へ(Stage 2b の second gate に接続)。

## 6. login 画面(identity playbook v1)

- 単一画面2プロバイダ(Google + Email/Password、タブでなくモード切替)。
- パスワード強度3チェック関数(8+ / 英字1+ / 数字1+、正規表現なし)。
- JP エラー文言: too-many-requests / invalid-email / email-already-in-use(「他の DXA Labs プロダクトで登録済みのメールアドレスです。サインインしてください」= 共有テナント帰結)。
- enumeration-safe reset(/forgot-password、user-not-found でも同一確認画面)。
- email verification = サインアップ直後 sendEmailVerification、機能ゲートしない、/app 上部に永続バナー(30秒 reload で検証検出→自動消滅→provisioning 再評価トリガ=Stage 2b 昇格パス)。
- login 画面に NEXT_PUBLIC_BUILD_SHA 表示(Parallel City 前例)。
- 視覚: editorial・atlas、深紺基調。

## 7. 審査中画面(/pending)

- 権威的・静かな待機。「アクセスを審査中です」。
- 焦らせない、拒絶しない。深紺基調(上振れ=期待の色)。
- 承認され次第の連絡を示唆。希少性を漂わせる editorial。
- 403+pending_activation を検出してこの状態へ。

## 8. H項(やらないこと、CI 監査でゼロ化)

Parallel City の H項 CI と同型で構造監査。以下を検出→ゼロ:
- glassmorphism / backdrop-filter: blur(現行 glass トークン含む)
- gradient mesh / 装飾グラデーション
- 遊戯的3D / アニメ多用
- emoji
- 過大な角丸(radius は §10(a) で確定)
- friendly イラスト
- 過大 hero 数字

## 9. 数値表示の規律

- 全数値に出典(REINFOLIB / e-Stat / DisasterShield)・単位・年次を添える。
- 概算位置注記(Stage 3b 確定:「地価表示位置は行政区の概算中心です」)。
- 「データなし」の honest 表示(Stage 3b の Site B null 継承)。
- コントラスト実測 AA 4.5:1 を Design gate に(DXA 前例踏襲)。

## 10. コンポーネント / 未確定微調整

- shadcn の dead weight(badge/button/card/separator、tabs のみ使用)は整理。editorial に必要なものだけ残す/追加。
実装 Stage 4-P2 で確定する微調整:
  (a) radius: 現行 0.75rem を editorial の抑制に寄せて締めるか。
  (b) chart 色: 無彩色/2軸パレットへの脱色度。
  (c) dark mode 地色: 現行 ink 継承か warmer atlas-dark か。

## Freeze status
FROZEN 2026-08-05 (Sho + architect approved). Implementation = Stage 4-P2.
Deviations require stopping to ask Sho — no independent judgment on spec matters.
Color pairs are contrast-matched (measured), per-mode (no single hex serves both
modes as text). Fonts: Zen Old Mincho 700 (和文 heading, subset) + Source Serif 4
700 (欧文 heading), Geist Sans/Mono for body/data. Step Zero = fix the broken
--font-sans self-reference before any heading work.
