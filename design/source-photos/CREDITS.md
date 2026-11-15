# Source Photos

This folder holds full-resolution source photos for the landing page and app
textures. The image files stay out of Git because they are large; this file
records where each one came from so it can be downloaded again.

All photos come from [Pexels](https://www.pexels.com/) under the
[Pexels License](https://www.pexels.com/license/): free to use, attribution
not required.

| Use | File | Size | Photographer | Source |
|---|---|---|---|---|
| Landing hero (light banana-leaf ridges) | `pexels-victoria-knyshova-177079167-12321610.jpg` | 3000 × 4000 | Victoria Knyshova | https://www.pexels.com/photo/12321610/ |
| Footer (dense leaf veins lit as circuit traces) | `pexels-amel-uzunovic-440739273-35451631.jpg` | 4037 × 6056 | Amel Uzunovic | https://www.pexels.com/photo/35451631/ |
| Alternate: dark banana-leaf ridges | `pexels-james-lee-932763-8148189.jpg` | 4000 × 6000 | James Lee | https://www.pexels.com/photo/8148189/ |
| Alternate: fiddle-leaf fig veins | `pexels-surya-prakash-1892195-8437290.jpg` | 2340 × 4160 | Surya Prakash | https://www.pexels.com/photo/8437290/ |
| Unused candidate: leaf veins | `pexels-kelly-2563471.jpg` | 3840 × 5760 | Kelly | https://www.pexels.com/photo/2563471/ |

`node scripts/export-landing-assets.mjs` exports the hero and footer photos
to `public/landing/` (2000 px wide, grayscale WebP) and renders the still
fallbacks and the Open Graph image from them with the landing shader. The app
header texture `public/textures/leaf-ridges-gray.webp` is a 2400 × 480 band
cropped from the hero photo (phase S2).
