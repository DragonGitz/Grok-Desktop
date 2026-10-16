# 🐉 Grok Desktop — *Dragonified Edition*

> **An AI wrote an app to tell you how much AI you've used.**
> We are aware of the irony. We have chosen to lean into it. Hard.

> [!IMPORTANT]
> **🤖 AI-generated code disclosure: "my tokens, not my code."**
> Every code change in this fork was written by **Grok** (xAI's AI), working as a Grok Bot coding agent at the direction of **DragonGitz**. DragonGitz requested the features, tested the builds, and paid for the tokens, but did not hand-write the code. Commits carry a `Generated-by: Grok (xAI) via Grok Bot coding agent` trailer. Details: [AI-GENERATED.md](AI-GENERATED.md).

Welcome to the **Dragonified** fork of [Grok Desktop](https://github.com/AnRkey/Grok-Desktop), the Electron app that wraps grok.com in multi-tab goodness. This fork was vibe-coded, debugged, rebuilt, and rebuilt *again* by an AI agent working on a real PC, while a human named Dragon pointed at screenshots and said "make the arrow bigger." Nobody wrote a design doc. The arrow is bigger now.

**All credit for the original app goes to [AnRkey](https://github.com/AnRkey)**, who built the actual foundation: tabs, the window, the always-on-top button, the usage bar idea. We just showed up with a flamethrower and a lot of opinions. ❤️ Upstream lives here: **https://github.com/AnRkey/Grok-Desktop**

> 🪞 **Why let an AI write it?** Because it's only right that an AI codes its own interface. You wouldn't let a human pick out your outfit either, right? Grok built the window it lives in, added the meter that counts how much Grok you use, and then asked for more tokens to polish it. Recursion is a lifestyle.

---

> **New icon (v2.0.5):** this fork uses an original black-hole / accretion-disk icon (`assets/icon.svg`) instead of the Grok logo, which is an xAI trademark.

## 🔥 What's new in the Dragonified build

### 📊 A usage meter that tells the truth (finally)
- **Weekly: 19%**, the *same* combined-pool number grok.com shows under Settings → Usage. No more "270/270 Fast" while your actual quota quietly drains.
- **Credits: $2.57**: your prepaid balance, right there in the bar. Click it to top up (the AI respects your wallet; it just also wants to be in it).
- **Reset you can click**: switch between `Reset: Wed, Oct 21, 9:57 AM` and a live `Reset: 4d 21:25` countdown.
- The 👁 hides the numbers when you'd rather not know. Your choice is remembered, because we respect you.
- **Pace tooltip**: hover for *Avg since reset*, *Left per day*, and *On pace for X% by reset*. It's basically a fuel gauge for your brain-outsourcing habit.
- Per-product breakdown (Chat / Build / Imagine / Bot) in the tooltip, for when you want to know *exactly* which hobby is eating the budget.

### 🔗 Links that go where they're supposed to
- Sign-in flows (accounts.x.ai, Google, Apple, X OAuth) stay **in the app**.
- Grok and xAI pages open **in new tabs**, including "Open Link in New Tab" on right-click.
- Everything else opens in **your real browser**, like a civilized program.

### 🤖 Bots, in tabs
- New **▾ flyout** next to `+`, styled after Windows Terminal (icons, separators, right-aligned hotkeys).
- **Bots** lists your grok.com bots; pick one (or hit `Ctrl+Shift+1..9`) and it opens in a fresh tab. Bots also get an **Open new tab** entry in their right-click menu, plus middle-click/Ctrl+click. Your AI teammates, one click away from the AI usage meter that tracks them. The circle of life.
- **Open Grok Bot** launches the desktop Grok Bot app if you have it installed.

### 🛠️ Build CLI launcher
- **Build CLI** runs the `grok` CLI **inside Grok Desktop as a terminal tab** (xterm.js + node-pty), titled after the folder. Close the tab, the process goes with it.
- **New…** (`Ctrl+Shift+N`) picks a folder; **pinned folders** sit on top, **recent folders** below (10 max). Hover a row for inline 📌 pin and 🗑️ remove.
- Your projects, one dropdown away from becoming someone else's problem (an AI's).

---

## 🚀 Getting it running

```powershell
git clone https://github.com/DragonGitz/Grok-Desktop
cd Grok-Desktop
npm install
npm run build-portable   # → build\Grok-Desktop_Portable-v*.exe
```

Close any other running copy of Grok Desktop first; it's a single-instance app and it *will* politely refuse to launch twice.

---

## ⚠️ The fine print, delivered with a straight face (mostly)
- Usage numbers come from grok.com's own endpoints. If xAI changes them, the meter may sulk until it gets patched.
- This is an unofficial fork, not affiliated with xAI, and absolutely not affiliated with any actual dragons.
- Bugs were introduced by humans *and* machines in a spirit of equal opportunity.

*Built with Grok, by an AI, for a Dragon, to measure Grok. 🐉⚡*
