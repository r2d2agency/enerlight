import * as faceapi from '@vladmandic/face-api';

const tf: any = (faceapi as any).tf;
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

let modelsLoaded = false;
let backendReady: 'webgl' | 'cpu' | null = null;

export async function ensureFaceModels() {
  if (!backendReady) {
    try {
      await tf.setBackend('webgl');
      await tf.ready();
      backendReady = 'webgl';
    } catch {
      await tf.setBackend('cpu');
      await tf.ready();
      backendReady = 'cpu';
    }
  }
  if (!modelsLoaded) {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  }
  return backendReady;
}

export async function detectDescriptor(video: HTMLVideoElement) {
  const tiny = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  let det = await faceapi
    .detectSingleFace(video, tiny)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!det) {
    const ssd = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
    det = await faceapi
      .detectSingleFace(video, ssd)
      .withFaceLandmarks()
      .withFaceDescriptor();
  }
  return det ? Array.from(det.descriptor) : null;
}

export function euclidean(a: number[], b: number[]) {
  return faceapi.euclideanDistance(new Float32Array(a), new Float32Array(b));
}

export interface FaceCandidate {
  id: string;
  name: string;
  descriptor: number[];
}

export interface FaceMatch {
  candidate: FaceCandidate;
  distance: number;
  score: number;
}

export function distanceToScore(distance: number): number {
  if (distance <= 0.6) return 100 - (distance / 0.6) * 40;
  if (distance <= 1.0) return 60 - ((distance - 0.6) / 0.4) * 60;
  return 0;
}

export function matchBest(descriptor: number[], candidates: FaceCandidate[]): FaceMatch | null {
  if (!candidates.length) return null;
  let best: FaceMatch | null = null;
  for (const c of candidates) {
    const d = euclidean(descriptor, c.descriptor);
    if (!best || d < best.distance) {
      best = { candidate: c, distance: d, score: distanceToScore(d) };
    }
  }
  return best;
}

/** Load all registered face descriptors from localStorage. */
export function loadLocalCandidates(namesById: Record<string, string>): FaceCandidate[] {
  const out: FaceCandidate[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('facial_desc_')) continue;
    const id = key.replace('facial_desc_', '');
    try {
      const desc = JSON.parse(localStorage.getItem(key) || '');
      if (Array.isArray(desc) && desc.length === 128) {
        out.push({ id, name: namesById[id] || 'Colaborador', descriptor: desc });
      }
    } catch {
      // skip
    }
  }
  return out;
}
