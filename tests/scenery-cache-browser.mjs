import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__texture-cache', route => route.fulfill({ contentType: 'text/html', body: '<body></body>' }));
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:5173'}/__texture-cache`);
  const result = await page.evaluate(async () => {
    const { sceneryTexture } = await import('/src/scenery-textures.ts');
    const start=performance.now(), a=sceneryTexture('lava',711), cold=performance.now()-start;
    const warmStart=performance.now(), b=sceneryTexture('lava',711), warm=performance.now()-warmStart;
    const image=a.image, pixels=image.toDataURL();
    a.repeat.set(7,9); let disposed=0; b.addEventListener('dispose',()=>disposed++); a.dispose();
    const sharedImage=b.image===image, independent=a!==b && b.repeat.x===1 && b.repeat.y===1 && disposed===0;
    for(let i=0;i<25;i++) sceneryTexture('wall',1000+i).dispose();
    const c=sceneryTexture('lava',711), evicted=c.image!==image, deterministic=c.image.toDataURL()===pixels;
    b.dispose(); c.dispose();
    return { cold, warm, sharedImage, independent, evicted, deterministic };
  });
  for (const key of ['sharedImage','independent','evicted','deterministic']) assert.equal(result[key],true,key);
  assert.deepEqual(errors,[]);
  console.log('Bounded scenery image cache preserves pixels and independent texture ownership:',result);
} finally { await browser.close(); }
