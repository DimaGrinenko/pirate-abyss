type DiagnosticContext = Pick<WebGLRenderingContext, 'isContextLost' | 'getError'>;
const labels: Record<number, string> = { 0: 'NO_ERROR', 0x0500: 'INVALID_ENUM', 0x0501: 'INVALID_VALUE', 0x0502: 'INVALID_OPERATION', 0x0505: 'OUT_OF_MEMORY', 0x0506: 'INVALID_FRAMEBUFFER_OPERATION', 0x9242: 'CONTEXT_LOST_WEBGL' };

export class FishWebglError extends Error {
  readonly stage: string;
  readonly contextLost: boolean;
  readonly code: number;
  constructor(stage: string, contextLost: boolean, code: number, driverLog?: string | null) {
    const status = `${labels[code] ?? 'UNKNOWN_ERROR'} (0x${code.toString(16)})`;
    const reason = driverLog?.trim() || (contextLost ? 'Waiting for webglcontextrestored.' : 'The driver returned no diagnostic log.');
    super(`Fish WebGL ${stage} failed; context=${contextLost ? 'lost' : 'active'}; error=${status}. ${reason}`);
    this.name = 'FishWebglError'; this.stage = stage; this.contextLost = contextLost; this.code = code;
  }
}

/** Read expensive/error-draining GL diagnostics only on failure, not per frame.
 * Context loss can make COMPILE_STATUS false and the shader log null without
 * a GLSL syntax problem; report that distinction explicitly. */
export function fishWebglError(gl: DiagnosticContext, stage: string, driverLog?: string | null, knownCode?: number) {
  const lost = gl.isContextLost(), code = knownCode ?? gl.getError();
  return new FishWebglError(stage, lost, code, driverLog);
}
