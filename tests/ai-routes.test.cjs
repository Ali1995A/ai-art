require('./route-loader.cjs');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let calls;
beforeEach(() => {
  globalThis[Symbol.for('family-ai.guard.v1')]?.clear();
  for (const k of Object.keys(process.env)) if (k.startsWith('AI_GUARD_') || k === 'AI_CALLS_ENABLED') delete process.env[k];
  process.env.ZHIPU_API_KEY = 'test-only-not-a-real-key'; calls = [];
  global.fetch = async (url, init) => { calls.push({url: String(url), init}); throw new Error('Unexpected network'); };
});
function req(body, method = 'POST') { return new Request('https://family.test/api/test', { method, ...(method === 'POST' ? {body: JSON.stringify(body)} : {}) }); }

const {POST}=require('../app/api/generate/route.ts');
test('drawing uses server-owned quality, size and model without a login step',async()=>{
  process.env.AIHUBMIX_API_KEY='test-only';process.env.AIHUBMIX_IMAGE_MODEL='test-image-model'; delete process.env.AI_IMAGE_QUALITY;delete process.env.AI_IMAGE_SIZE;
  global.fetch=async(url,init)=>{calls.push({url,init});return Response.json({data:[{b64_json:'dGVzdA=='}]});};
  const r=await POST(req({mode:'txt2img',prompt:'cat',quality:'high',size:'1536x1024',model:'client-model'}));assert.equal(r.status,200);
  const body=JSON.parse(calls[0].init.body);assert.equal(body.model,'test-image-model');assert.equal(body.quality,'low');assert.equal(body.size,'512x512');assert.equal(body.n,1);
});
test('image payload cannot be an arbitrary remote fetch request',async()=>{
  assert.equal((await POST(req({mode:'img2img',prompt:'cat',imageDataUrl:'https://untrusted.example/image'}))).status,400);
  assert.equal((await POST(req({mode:'txt2img',prompt:'x'.repeat(2001)}))).status,400);assert.equal(calls.length,0);
});
