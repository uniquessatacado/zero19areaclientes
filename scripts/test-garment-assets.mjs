import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('assets/garment3d/manifest.json', root), 'utf8'));
for (const [kind, model] of Object.entries(manifest.models)) {
  if (!model) continue;
  const bytes = readFileSync(new URL(model.path, root));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${kind}: GLB magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${kind}: GLB version`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${kind}: complete GLB`);
  assert.equal(bytes.length, model.bytes, `${kind}: manifest byte count`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), model.sha256, `${kind}: integrity`);
  assert.equal(model.viewDeformation,'relaxed-shoulders-neckline-v1',`${kind}: visual deformation disclosed`);
  assert.match(model.changes,/ombros.*gola/i,`${kind}: shoulder and neckline refinements attributed`);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.match(gltf.asset.extras.license, /CC-BY-4\.0/, `${kind}: original license retained`);
  assert.equal(gltf.asset.extras.source, model.source, `${kind}: provenance retained`);
  assert.equal(gltf.nodes.length, model.geometry.nodes);
  assert.equal(gltf.meshes.length, model.geometry.meshes);
  assert.ok(gltf.images.every(image => Number.isInteger(image.bufferView) && !image.uri), `${kind}: embedded images`);
  let vertices = 0; let triangles = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4, `${kind}: triangle mesh`);
    for (const attribute of ['POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0']) assert.ok(Number.isInteger(primitive.attributes[attribute]), `${kind}: ${attribute}`);
    vertices += gltf.accessors[primitive.attributes.POSITION].count;
    triangles += gltf.accessors[primitive.indices].count / 3;
  }
  assert.equal(vertices, model.geometry.verticesWithPrimitiveDuplicates);
  assert.equal(triangles, model.geometry.triangles);
  console.log(`${kind}: provenance, SHA-256, embedded textures and ${triangles} triangles verified`);
}
assert.equal(manifest.models.normal.adaptation,'regular-from-oversized-v1','Normal must explicitly identify the geometric derivative');
assert.equal(manifest.models.normal.path,manifest.models.oversized.path,'Derivative reuses the original licensed source, not a fictitious second download');
assert.equal(manifest.models.normal.sha256,manifest.models.oversized.sha256);
assert.match(manifest.models.normal.label,/adapta/i);
assert.match(manifest.models.normal.changes,/adapt|deforma/i,'Derivative attribution discloses the transformation');
console.log('Garment asset manifest checks passed.');
