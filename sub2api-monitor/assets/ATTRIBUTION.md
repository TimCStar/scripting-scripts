# Bundled platform artwork

Retrieved 2026-10-09. Artwork identifies the account provider; no affiliation or endorsement is implied. These are actual logo assets, not SF Symbols or redrawn approximations. All runtime images are bundled offline PNG files.

## Google Antigravity

Official press kit: https://antigravity.google/press
Exact full-color source: https://antigravity.google/assets/image/brand/antigravity-icon__full-color.svg
The bundled light/dark PNGs retain the original full-color path and gradient artwork, with transparent canvas trimmed and uniformly scaled. The upstream Sub2API cloud pictogram is not used.
Google owns its brand marks. The press page provides downloadable artwork but does not state a blanket open-source license; these marks are not represented as MIT-licensed.

## OpenAI and Claude

Vector sources: LobeHub lobe-icons, downloaded from the master branch on 2026-10-09.
- OpenAI: https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/openai.svg
- Claude: https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/claude-color.svg
- Library license: https://github.com/lobehub/lobe-icons/blob/master/LICENSE
The master revision reported during retrieval was c385b2b8d1f9e19aa86e628d4e23c91ee1111a47; asset download URLs used master, so individual-file correspondence to that revision was not separately verified.
Rendering copies resolve em dimensions to 24px; OpenAI currentColor resolves to black for light appearance and white for dark appearance. Claude retains the source terracotta color. Paths are unchanged.
LobeHub library code/assets are supplied under the included MIT notice (LOBE-ICONS-LICENSE). Trademark rights remain with OpenAI and Anthropic; the library license does not grant trademark rights.

## Rendering and native API

Runtime PNG output: 128×128 RGBA, with a maximum 120px drawing dimension and transparent padding. Rendered with Inkscape, then cropped/resized uniformly with Pillow. No image-generation model or hand-drawn approximation was used. Actual outputs were visually inspected on light and dark backgrounds.
Scripting uses Image.filePath with dynamic light/dark paths, Script.directory and global Path.join:
https://scriptingapp.github.io/guide/Views/Image/
https://scriptingapp.github.io/guide/Views/Image/index_example
UIImage.fromFile is also documented but is unnecessary:
https://scriptingapp.github.io/guide/Utilities/UIImage
This validates the documented API, not an on-device execution.

## SHA-256 of runtime PNGs

- antigravity-light.png: b8a809d788eebfbd02fd94351dd8b24ebc06952c902735467fad052885fb6dd5
- claude-light.png: ef4bc151001e2b53914b1e299709ec784766b368fe96343d6582cc014f9fa872
- openai-light.png: 9886273ac70cf916e5899fc52280cb3242a62839a8d7ee7c5487d561411fdd7c
- antigravity-dark.png: b8a809d788eebfbd02fd94351dd8b24ebc06952c902735467fad052885fb6dd5
- claude-dark.png: ef4bc151001e2b53914b1e299709ec784766b368fe96343d6582cc014f9fa872
- openai-dark.png: 6043c876a7dfea832a34b652a23db54f3cd50b4696d13747e7c08c11ce68ea99
