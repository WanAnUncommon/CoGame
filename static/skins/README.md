# Skin assets

`gothic-void.jpg` is sourced from the Codex Dream Skin community preset:

https://github.com/Fei-Away/Codex-Dream-Skin/tree/main/windows/presets/preset-gothic-void-crusade

The other JPG files are local color-graded variants of that background. They are
kept as pure 16:9 backgrounds without application chrome, controls, or text.

Place additional `.png`, `.jpg`, `.jpeg`, or `.webp` wallpapers in this folder.
The wardrobe page scans the directory whenever the app is loaded or refreshed.
Images must be non-empty, no larger than 16 MB, at most 16384 pixels on either
edge, and at most 50 million pixels in total.

`skins.json` is optional metadata keyed by filename. Unlisted images still appear
using their filename, a generic description, and the `本地资源` source label.