import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { MAX_RENDER_PIXEL_FRAMES } from '../../../packages/contracts/src/generations.js';

const MAX_RENDER_OUTPUT_BYTES = 2_000_000_000;

interface RuntimeInspection {
  definition: { width: number; height: number; fps: number; duration: number; scenes: Array<{ start: number; duration: number }> };
  registeredIds: string[];
  editableIds: string[];
  stateChanged: boolean;
}

declare global {
  interface Window {
    __MOTIONLY_RENDER__?: {
      ready: boolean;
      runtime: { elements: Map<string, HTMLElement>; seek(time: number): void };
      definition: RuntimeInspection['definition'];
    };
  }
}

export async function withBrowser<T>(
  htmlPath: string,
  operation: (page: Page, browser: Browser) => Promise<T>,
  beforeNavigation?: (page: Page) => void,
): Promise<T> {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--allow-file-access-from-files'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    beforeNavigation?.(page);
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0', timeout: 30_000 });
    await page.waitForFunction(() => window.__MOTIONLY_RENDER__?.ready === true, { timeout: 30_000 });
    return await operation(page, browser);
  } finally {
    await browser.close();
  }
}

export async function inspectRuntime(page: Page): Promise<RuntimeInspection> {
  const inspection = await page.evaluate(() => {
    const mounted = window.__MOTIONLY_RENDER__!;
    const ids = Array.from(mounted.runtime.elements.keys());
    const rawEditableIds = Array.from(document.querySelectorAll<HTMLElement>('#motionly-root [data-edit]'))
      .map((element) => element.dataset.edit);
    if (rawEditableIds.some((id) => !id || !/^[a-zA-Z0-9_-]+$/.test(id))) {
      throw new Error('Editable Motionly layer IDs must be non-empty stable identifiers.');
    }
    const editableIds = rawEditableIds as string[];
    if (new Set(editableIds).size !== editableIds.length) throw new Error('Editable Motionly layer IDs must be unique.');
    for (const id of editableIds) {
      if (!mounted.runtime.elements.has(id)) throw new Error(`Editable Motionly layer is not registered: ${id}`);
    }
    for (const id of ids) {
      const element = mounted.runtime.elements.get(id);
      if (!element || element.dataset.edit !== id || element.dataset.motionlyId !== id) {
        throw new Error(`Registered Motionly layer is not selectable/editable: ${id}`);
      }
    }
    if (!ids.length) throw new Error('No registered Motionly layer was mounted.');
    const state = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return `${style.opacity}|${style.transform}|${style.filter}|${style.clipPath}`;
    };
    mounted.runtime.seek(0);
    const before = new Map(ids.map((id) => [id, state(mounted.runtime.elements.get(id)!)]));
    mounted.runtime.seek(Math.min(mounted.definition.duration, Math.max(0.5, 1 / mounted.definition.fps)));
    const stateChanged = ids.some((id) => before.get(id) !== state(mounted.runtime.elements.get(id)!));
    mounted.runtime.seek(0);
    return { definition: mounted.definition, registeredIds: ids, editableIds, stateChanged };
  });
  validateDefinition(inspection.definition);
  return inspection;
}

export async function configureCompositionViewport(page: Page, definition: RuntimeInspection['definition']) {
  validateDefinition(definition);
  await page.setViewport({ width: definition.width, height: definition.height, deviceScaleFactor: 1 });
}

export function representativeTimes(definition: RuntimeInspection['definition'], maxFrames = 18): number[] {
  if (!Number.isInteger(maxFrames) || maxFrames < 2) throw new Error('Representative capture requires at least two frames.');
  const finalTime = quantize(Math.max(0, definition.duration - 1 / definition.fps), definition.fps);
  const midpoints = definition.scenes.map((scene) => quantize(scene.start + scene.duration / 2, definition.fps));
  const selectedMidpoints = sampleEvenly(midpoints, Math.min(midpoints.length, maxFrames - 1));
  const selected = new Set<number>([...selectedMidpoints, finalTime]);
  const optional = definition.scenes.flatMap((scene) => [
    quantize(scene.start, definition.fps),
    quantize(Math.min(definition.duration, scene.start + scene.duration - 1 / definition.fps), definition.fps),
  ]).filter((time) => !selected.has(time));
  for (const time of sampleEvenly(optional, maxFrames - selected.size)) selected.add(time);
  return [...selected].filter((time) => Number.isFinite(time) && time >= 0 && time <= definition.duration)
    .sort((left, right) => left - right);
}

export async function captureFrames(page: Page, workspace: string, times: number[]) {
  const directory = path.join(workspace, 'artifacts', 'frames');
  await mkdir(directory, { recursive: true });
  const element = await page.$('#motionly-root');
  if (!element) throw new Error('Motionly root was not found for capture.');
  const frames: Array<{ time: number; file: string; visibleEditableIds: string[]; clippedEditableIds: string[]; overflowsRoot: boolean }> = [];
  for (let index = 0; index < times.length; index += 1) {
    const time = times[index]!;
    await page.evaluate((seekTime) => window.__MOTIONLY_RENDER__!.runtime.seek(seekTime), time);
    const file = path.join(directory, `frame-${String(index).padStart(3, '0')}.png`);
    await element.screenshot({ path: file, type: 'png' });
    const diagnostics = await page.evaluate(() => {
      const root = document.querySelector('#motionly-root');
      if (!(root instanceof HTMLElement)) throw new Error('Motionly root was not found for diagnostics.');
      const rootRect = root.getBoundingClientRect();
      const visibleEditableIds: string[] = [];
      const clippedEditableIds: string[] = [];
      for (const node of root.querySelectorAll<HTMLElement>('[data-edit]')) {
        const id = node.dataset.edit;
        if (!id) continue;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const visible = node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
          && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.01
          && rect.width > 0 && rect.height > 0
          && rect.right > rootRect.left && rect.left < rootRect.right && rect.bottom > rootRect.top && rect.top < rootRect.bottom;
        if (!visible) continue;
        visibleEditableIds.push(id);
        if (rect.left < rootRect.left - 1 || rect.top < rootRect.top - 1 || rect.right > rootRect.right + 1 || rect.bottom > rootRect.bottom + 1) {
          clippedEditableIds.push(id);
        }
      }
      return {
        visibleEditableIds,
        clippedEditableIds,
        overflowsRoot: root.scrollWidth > root.clientWidth + 1 || root.scrollHeight > root.clientHeight + 1,
      };
    });
    frames.push({ time, file: path.relative(workspace, file).replaceAll('\\', '/'), ...diagnostics });
  }
  return frames;
}

export function assertRepresentativeFrames(
  definition: RuntimeInspection['definition'],
  frames: Array<{ time: number; visibleEditableIds: string[] }>,
  maxFrames = 18,
) {
  const tolerance = 1 / definition.fps + 0.0001;
  const midpoints = definition.scenes.map((scene) => quantize(scene.start + scene.duration / 2, definition.fps));
  const midpointFrames = frames.filter((frame) => midpoints.some((time) => Math.abs(frame.time - time) <= tolerance));
  const expectedMidpoints = Math.min(midpoints.length, Math.max(0, maxFrames - 1));
  if (midpointFrames.length < expectedMidpoints) throw new Error('Representative capture omitted required scene midpoint coverage.');
  const requiredTimes = [
    ...midpointFrames.map((frame) => frame.time),
    quantize(Math.max(0, definition.duration - 1 / definition.fps), definition.fps),
  ];
  for (const requiredTime of requiredTimes) {
    const frame = frames.find((candidate) => Math.abs(candidate.time - requiredTime) <= tolerance);
    if (!frame || !frame.visibleEditableIds.length) throw new Error(`Representative frame is blank at ${requiredTime.toFixed(3)}s.`);
  }
}

export async function exportVideo(page: Page, workspace: string, definition: RuntimeInspection['definition']) {
  const frameCount = Math.ceil(definition.duration * definition.fps);
  if (frameCount < 1 || frameCount > 18_000) throw new Error('Export is limited to 18,000 frames per job.');
  const artifactDirectory = path.join(workspace, 'artifacts');
  const outputPath = path.join(artifactDirectory, 'video.mp4');
  await mkdir(artifactDirectory, { recursive: true });
  const element = await page.$('#motionly-root');
  if (!element) throw new Error('Motionly root was not found for export.');
  const captureElement = element;
  const frameHashes: string[] = [];
  async function* pngFrames() {
    for (let frame = 0; frame < frameCount; frame += 1) {
      await page.evaluate((time) => window.__MOTIONLY_RENDER__!.runtime.seek(time), frame / definition.fps);
      const png = Buffer.from(await captureElement.screenshot({ type: 'png' }));
      frameHashes.push(createHash('sha256').update(png).digest('hex'));
      yield png;
    }
  }
  await runFfmpegWithFrames([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-framerate', String(definition.fps), '-vcodec', 'png', '-i', 'pipe:0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-r', String(definition.fps), '-fs', String(MAX_RENDER_OUTPUT_BYTES), outputPath,
  ], pngFrames());
  const metadata = await probeVideo(outputPath);
  if (metadata.codec !== 'h264' || metadata.width !== definition.width || metadata.height !== definition.height
    || metadata.frameCount !== frameCount || Math.abs(metadata.duration - definition.duration) > 1 / definition.fps + 0.01) {
    throw new Error(`Export metadata did not match the composition: ${JSON.stringify(metadata)}`);
  }
  const [ffmpegVersion, ffprobeVersion] = await Promise.all([
    commandVersion(process.env.FFMPEG_PATH ?? 'ffmpeg'),
    commandVersion(process.env.FFPROBE_PATH ?? 'ffprobe'),
  ]);
  return {
    file: path.relative(workspace, outputPath).replaceAll('\\', '/'), frameCount, fps: definition.fps, frameHashes, metadata,
    toolchain: { ffmpeg: ffmpegVersion, ffprobe: ffprobeVersion },
  };
}

async function runFfmpegWithFrames(args: string[], frames: AsyncIterable<Buffer>) {
  const child = spawn(process.env.FFMPEG_PATH ?? 'ffmpeg', args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => { stderr = `${stderr}${chunk.toString('utf8')}`.slice(-20_000); });
  const closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg export failed (${code}): ${stderr}`)));
  });
  const piped = pipeline(Readable.from(frames), child.stdin);
  const [pipeResult, closeResult] = await Promise.allSettled([piped, closed]);
  if (pipeResult.status === 'rejected' && errorCode(pipeResult.reason) !== 'EPIPE') throw pipeResult.reason;
  if (closeResult.status === 'rejected') throw closeResult.reason;
  if (pipeResult.status === 'rejected') throw pipeResult.reason;
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
}

async function probeVideo(filePath: string) {
  const output = await runFfprobe([
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,nb_frames:format=duration',
    '-of', 'json', filePath,
  ]);
  const parsed = JSON.parse(output) as { streams?: Array<{ codec_name?: unknown; width?: unknown; height?: unknown; nb_frames?: unknown }>; format?: { duration?: unknown } };
  const stream = parsed.streams?.[0];
  const metadata = {
    codec: String(stream?.codec_name ?? ''),
    width: Number(stream?.width),
    height: Number(stream?.height),
    frameCount: Number(stream?.nb_frames),
    duration: Number(parsed.format?.duration),
  };
  if (!Number.isFinite(metadata.width) || !Number.isFinite(metadata.height)
    || !Number.isFinite(metadata.frameCount) || !Number.isFinite(metadata.duration)) {
    throw new Error('FFprobe returned incomplete export metadata.');
  }
  return metadata;
}

function runFfprobe(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(process.env.FFPROBE_PATH ?? 'ffprobe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout = `${stdout}${chunk.toString('utf8')}`.slice(-100_000); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = `${stderr}${chunk.toString('utf8')}`.slice(-20_000); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`FFprobe failed (${code}): ${stderr}`)));
  });
}

function commandVersion(executable: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, ['-version'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output = `${output}${chunk.toString('utf8')}`.slice(0, 2_000); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) return reject(new Error(`${path.basename(executable)} version check failed (${code}).`));
      resolve(output.split(/\r?\n/)[0]?.trim().slice(0, 500) || 'unknown');
    });
  });
}

function validateDefinition(definition: RuntimeInspection['definition']) {
  if (!Number.isInteger(definition.width) || !Number.isInteger(definition.height)
    || definition.width < 1 || definition.height < 1
    || definition.width > 7_680 || definition.height > 7_680
    || definition.width * definition.height > 33_177_600) {
    throw new Error('Composition dimensions exceed the renderer safety limit.');
  }
  if (!Number.isInteger(definition.fps) || definition.fps < 1 || definition.fps > 240) {
    throw new Error('Composition frame rate is invalid.');
  }
  if (!Number.isFinite(definition.duration) || definition.duration <= 0 || definition.duration > 86_400) {
    throw new Error('Composition duration is invalid.');
  }
  if (definition.width * definition.height * Math.ceil(definition.duration * definition.fps) > MAX_RENDER_PIXEL_FRAMES) {
    throw new Error('Composition exceeds the pixel-frame render budget.');
  }
  if (!Array.isArray(definition.scenes) || !definition.scenes.length) throw new Error('Composition must define at least one scene.');
  for (const scene of definition.scenes) {
    if (!Number.isFinite(scene.start) || !Number.isFinite(scene.duration) || scene.start < 0 || scene.duration <= 0
      || scene.start + scene.duration > definition.duration + 1 / definition.fps) {
      throw new Error('Composition scene timing is invalid.');
    }
  }
}

function quantize(time: number, fps: number) {
  return Math.round(time * fps) / fps;
}

function sampleEvenly<T>(values: T[], count: number): T[] {
  if (count <= 0 || !values.length) return [];
  if (count >= values.length) return [...values];
  if (count === 1) return [values[Math.floor((values.length - 1) / 2)]!];
  const selected: T[] = [];
  for (let index = 0; index < count; index += 1) {
    selected.push(values[Math.round(index * (values.length - 1) / (count - 1))]!);
  }
  return selected;
}
