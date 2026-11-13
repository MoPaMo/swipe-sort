# SwipeSort

Tinder-style photo sorter built with Expo (SDK 58). You swipe right to keep a photo and left to queue it for deletion. Nothing is deleted until you open the trash and confirm.

## Run it

```bash
npm install
npx expo start
```

Then scan the QR code with your iPhone camera to open it in **Expo Go**. Every library the app uses ships with Expo Go, so you don't need a native build.

If your Expo Go version doesn't support SDK 58 yet, or you want your own app icon and name in the permission prompt, make a dev build. On a Mac with Xcode:

```bash
npx expo run:ios --device
```

## Run it without a laptop (GitHub Actions → Expo Go)

`.github/workflows/expo-go.yml` runs the dev server on a GitHub runner and exposes it through Expo's tunnel.

1. Create a token: expo.dev → Account settings → Access tokens.
2. Add it to this repo as an Actions secret named `EXPO_TOKEN` (Settings → Secrets and variables → Actions).
3. Go to Actions → **Expo Go dev server** → **Run workflow**. Every push to `main` also starts it.
4. In Expo Go, signed in to the same account, open the project under **Development servers**. The run summary also shows the URL to paste in manually.

The server stays up for about 5.5 hours, or until you cancel the run. Metro and `console.log` output stream into the job log.

## How it works

| Gesture / button | Action |
|---|---|
| Swipe right / ♥ | Keep. It won't show up again in later sessions. |
| Swipe left / ✕ | Adds the photo to the trash queue. |
| ↺ | Undoes the last decision (up to 50 back). |
| Trash icon | Shows queued photos. Tap one to restore it, or delete them all at once. |
| Options icon | Switches between newest and oldest first, or makes kept photos show up again. |

- **Batch delete:** everything in the trash goes to the system in one call, so you get one confirmation prompt instead of one per photo. On iOS the photos land in *Recently Deleted* for 30 days. On Android they're deleted permanently.
- **Progress is saved:** kept IDs, the trash queue and the sort order are stored in AsyncStorage, so you can close the app and pick up where you left off.
- **Paging:** photos load in pages using a creation-time cursor rather than an offset, so deleting photos never shifts or skips pages. Only light metadata is queried, and each image is decoded only when its card is in the stack (top 3).
- **Limited access (iOS):** if you granted access to only some photos, a banner lets you add more.

## Files

```
App.tsx                 permission gate, header, controls, empty states
src/SwipeDeck.tsx       card stack, pan gesture, fly-out animation, KEEP/DELETE stamps, haptics
src/usePhotoQueue.ts    library paging, keep/trash/undo state, persistence, batch delete
src/TrashReview.tsx     review grid and confirm-delete sheet
src/storage.ts          AsyncStorage helpers
src/theme.ts            colours
```

Built with `expo-media-library` (the new `Query` / `Asset` API), `expo-image` (loads `ph://` and `content://` IDs directly), `react-native-gesture-handler` v3 hooks, and Reanimated 4.

## Tweaks

- Swipe sensitivity is set by `SWIPE_THRESHOLD` and `VELOCITY_THRESHOLD` in `src/SwipeDeck.tsx`.
- To include videos, change the `MEDIA_TYPE` filter in `fetchPage` (`src/usePhotoQueue.ts`), for example to `.within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO])`.
