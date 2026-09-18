# Three.js r180 (0.180.0)

Source: https://github.com/mrdoob/three.js/tree/r180

License: MIT, preserved in LICENSE.

Only the WebGL ES modules and required GLTFLoader, OrbitControls,
DecalGeometry and BufferGeometryUtils addons are vendored. The addons'
bare `three` imports were changed to `../../three.module.js` so the
local browser modules do not require an import map or a third-party CDN.
`three.module.js` is the official minified build; its core module is
`three.core.min.js`. No models are included under this library license.
