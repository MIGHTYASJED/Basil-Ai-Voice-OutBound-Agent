// Audio transcoding for the media bridge.
//
// Phone side (Telnyx/Twilio): G.711 μ-law (PCMU), 8000 Hz, mono, 8-bit.
// Gemini Live INPUT:  16-bit PCM, 16000 Hz, mono, little-endian.
// Gemini Live OUTPUT: 16-bit PCM, 24000 Hz, mono, little-endian.
//
// So per call we continuously transcode in BOTH directions:
//   Driver → Gemini:  μ-law 8k → PCM16 → upsample 8k→16k
//   Gemini → Driver:  PCM16 24k → downsample 24k→8k → μ-law 8k
//
// Getting these formats wrong is the #1 cause of garbled/chipmunk audio in
// voice-AI projects, so this is implemented and isolated here. Pure JS (no
// native deps) so it runs anywhere; for very high concurrency you'd move this
// to a native/WASM resampler, but the math is identical.

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

/** Decode one μ-law byte to a 16-bit linear PCM sample. */
export function muLawDecodeSample(uVal: number): number {
  uVal = ~uVal & 0xff;
  const sign = uVal & 0x80;
  const exponent = (uVal >> 4) & 0x07;
  const mantissa = uVal & 0x0f;
  let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
  sample -= MULAW_BIAS;
  return sign ? -sample : sample;
}

/** Encode one 16-bit linear PCM sample to a μ-law byte. */
export function muLawEncodeSample(sample: number): number {
  let sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  if (sample > MULAW_CLIP) sample = MULAW_CLIP;
  sample += MULAW_BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** μ-law buffer → Int16 PCM array. */
export function muLawToPcm16(mulaw: Buffer): Int16Array {
  const out = new Int16Array(mulaw.length);
  for (let i = 0; i < mulaw.length; i++) out[i] = muLawDecodeSample(mulaw[i]);
  return out;
}

/** Int16 PCM array → μ-law buffer. */
export function pcm16ToMuLaw(pcm: Int16Array): Buffer {
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = muLawEncodeSample(pcm[i]);
  return out;
}

/** Linear-interpolation resampler between arbitrary sample rates. */
export function resample(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return input;
  const ratio = toRate / fromRate;
  const outLen = Math.floor(input.length * ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcPos - i0;
    out[i] = (input[i0] * (1 - frac) + input[i1] * frac) | 0;
  }
  return out;
}

/** Convenience: phone μ-law 8k → Gemini PCM16 16k (returns raw little-endian bytes). */
export function phoneToGemini(mulaw8k: Buffer): Buffer {
  const pcm8k = muLawToPcm16(mulaw8k);
  const pcm16k = resample(pcm8k, 8000, 16000);
  return Buffer.from(pcm16k.buffer, pcm16k.byteOffset, pcm16k.byteLength);
}

/** Convenience: Gemini PCM16 24k bytes → phone μ-law 8k. */
export function geminiToPhone(pcm24kBytes: Buffer): Buffer {
  const pcm24k = new Int16Array(pcm24kBytes.buffer, pcm24kBytes.byteOffset, pcm24kBytes.byteLength / 2);
  const pcm8k = resample(pcm24k, 24000, 8000);
  return pcm16ToMuLaw(pcm8k);
}
