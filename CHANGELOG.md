# Changelog

One entry per `versionCode` uploaded to Play Console. `versionCode` is the CI run
number of the `release-android.yml` run that produced the AAB, so each track's
upload has its own. From vc 38 onward `versionName` also carries the commit
(`1.0.<vc>+<sha>`), which is the reliable way to map a tester's report to code.

## Unreleased

- Players can delete their account and all its data from Settings, plus a public
  route at `delete-account.html` for anyone who has uninstalled (both required by
  Google Play once an app offers sign-in). Firestore rules now allow an owner to
  delete their own `players/{uid}` and `saves/{uid}`.
- Privacy policy rewritten: it still claimed there was no login system and no
  email collected, both false since Google Sign-In shipped.
- The e2e smoke test now runs in CI instead of only when someone remembered to.
- Dependabot watches npm and Actions monthly.

## vc 36 (closed testing) / 37 (internal testing)

- Fixed levels not ending when every path was cleared — an undefined `stars` in
  `onWin()` threw on every win in every mode, making earlier builds unfinishable.
  ESLint's `no-undef` now fails the build to stop that class of bug recurring.
- Fixed the slowdown from level 61 onward: 34fps → a steady 60fps, including on
  the densest boards. The Lock-Key padlock and Golden Path glows were repainting
  whole cube faces every frame.
- Fixed multi-second freezes on `holo` skins.
- Fixed music staying silent after switching apps, at its root cause.
- Incoming calls and screen lock now pause the game and its timer even when
  another screen is already open.
- A lost ad callback can no longer permanently disable pause-on-call.

## vc 34 / 35

Superseded. Fixed the unfinishable-level bug but still slow from level 61 on.

## vc 32 / 33

Superseded — levels could not be completed at all.
