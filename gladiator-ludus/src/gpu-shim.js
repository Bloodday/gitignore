// Compatibilidad: navegadores con WebGPU anterior a 'texture-component-swizzle'
// rechazan la propiedad `swizzle` que añade three.js a los descriptores de vista.
if (typeof GPUTexture !== 'undefined' && !GPUTexture.prototype.__ludusPatched) {
  const orig = GPUTexture.prototype.createView;
  GPUTexture.prototype.createView = function (desc) {
    if (desc && 'swizzle' in desc && !this.device?.features?.has?.('texture-component-swizzle')) {
      desc = { ...desc }; delete desc.swizzle;
    }
    return orig.call(this, desc);
  };
  GPUTexture.prototype.__ludusPatched = true;
}
