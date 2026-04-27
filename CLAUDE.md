# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (Turbopack, http://localhost:3000)
npm run build    # Production build (also Turbopack)
npm run start    # Start production server
npm run lint     # Run ESLint directly (next lint was removed in v16)
```

## Architecture

- **Next.js 16** with App Router (`src/app/`). Turbopack is the default for both `dev` and `build`.
- **React 19** with TypeScript strict mode
- **Tailwind CSS v4** — no `tailwind.config.ts`. Custom theme tokens go in `src/app/globals.css` inside an `@theme inline {}` block. Import is `@import "tailwindcss"` (not the v3 directives).
- Path alias `@/*` → `src/*`

## Key Conventions

- All pages/layouts use App Router conventions (`page.tsx`, `layout.tsx`, `loading.tsx`, etc.) under `src/app/`
- Components with state, effects, or browser APIs need `'use client'` at the top. Default components are Server Components.
- `params` in page/layout components is a `Promise` in Next.js 16 — always `await params` before destructuring.
- Fonts are loaded via `next/font/google` in `layout.tsx` and injected as CSS variables (`--font-geist-sans`, `--font-geist-mono`).
- ESLint uses flat config (`eslint.config.mjs`) with `next/core-web-vitals` and `next/typescript`.
- `serverRuntimeConfig` / `publicRuntimeConfig` are removed — use `process.env` directly or `NEXT_PUBLIC_` prefix for client-side values.

---

## ぷよぷよ 要件定義

### 概要

Next.js 16 + React 19 で実装するシングルページのぷよぷよパズルゲーム。モダン・ネオンダークの UI/UX を持ち、キーボード操作で遊ぶブラウザゲーム。

### ファイル構成

| ファイル | 役割 |
|---|---|
| `src/lib/puyo.ts` | 純粋なゲームロジック（副作用なし） |
| `src/components/PuyoGame.tsx` | メインゲームコンポーネント（`'use client'`） |
| `src/app/page.tsx` | エントリーポイント（Server Component） |

### ゲームルール

#### 盤面
- 6列 × 12行（表示） + 1行（隠し行、index=0）= 配列は 13 行
- 上から落下、下が積み上がる

#### ぷよ
- 色：赤 (R)・緑 (G)・青 (B)・黄 (Y)・紫 (P) の 5 色
- 2 個 1 組のペアで落下（ピボット + サテライト）
- 同色が上下左右に 4 個以上つながると消える

#### ピース操作
| 入力 | 動作 |
|---|---|
| `←` / `→` | 左右移動 |
| `↓` | ソフトドロップ（1 段下へ） |
| `Space` | ハードドロップ（最下段へ即落下） |
| `Z` / `↑` | 反時計回り回転 |
| `X` | 時計回り回転 |
| `R` | ゲームオーバー時にリスタート |

#### 回転
- サテライトの方向：0=上, 1=右, 2=下, 3=左
- 壁キック：回転できない場合、左右±1・±2 列にずらして再試行

#### 落下・着地・連鎖フロー
1. `falling` フェーズ：インターバルごとに 1 段落下
2. 着地したら `landPiece` → `applyGravity` → `findGroups`
3. 消えるグループがあれば `clearing` フェーズへ（500ms アニメーション）
4. `RESOLVE` で `clearGroups` → `applyGravity` → 再度 `findGroups`（連鎖）
5. 消えるグループがなくなったら次のピースをスポーン

#### スコア計算
```
score += 10 × puyos_cleared × max(1, CHAIN_POWER[chain])
CHAIN_POWER = [0, 0, 8, 16, 32, 64, 96, 128, ...]
```

#### レベル
- 20 個消去ごとに 1 レベルアップ
- 落下インターバル：`max(150ms, 800ms − (level − 1) × 60ms)`

#### ゲームオーバー
- 次ピースのスポーン位置（row=1, col=2）が埋まっている場合

### UI 仕様

#### ビジュアル
- 背景：ラジアルグラデーション（ダークネイビー → ほぼ黒）
- 盤面：半透明ダーク + 薄いグリッド線 + 外枠グロー
- ぷよ：円形グラデーション + ネオングロー + 目のハイライト
- ゴーストピース：同色を 35% 透明度で最下段位置に表示

#### カラーパレット
| 色 | bg | glow |
|---|---|---|
| R (赤) | `#ff2244` | `#ff224488` |
| G (緑) | `#22dd44` | `#22dd4488` |
| B (青) | `#2266ff` | `#2266ff88` |
| Y (黄) | `#ffdd00` | `#ffdd0088` |
| P (紫) | `#bb33ff` | `#bb33ff88` |

#### パネル構成
- 左：スコア / ベスト / レベル / チェーン数
- 中央：ゲーム盤面
- 右：ネクストピースプレビュー

#### 連鎖エフェクト
- `clearing` フェーズ中に盤面中央へ連鎖ラベルをポップアップ表示
- チェーン数に応じたラベル：Chain! / Double! / Triple! / Quadruple! など
- 消えるぷよは `scale(1.4)` + `opacity: 0` でアニメーション退場

### 実装上の制約

- ゲームロジック（`src/lib/puyo.ts`）は純粋関数のみ。React・DOM に依存しない。
- `useReducer` で全ゲーム状態を管理。`useState` を個別に増やさない。
- `useEffect` は「落下インターバル」と「連鎖解決タイムアウト」の 2 つのみ。
- スタイルはインラインスタイルで記述（Tailwind はレイアウト補助のみ）。
- `'use client'` は `PuyoGame.tsx` にのみ付与。`page.tsx` は Server Component のまま。
