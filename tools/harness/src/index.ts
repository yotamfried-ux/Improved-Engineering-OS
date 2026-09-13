/**
 * @ieos/harness -- the Stage 0 evaluation harness foundation.
 *
 * What exists: the runtime doctor (R4), the isolation contract (ADR-0005), a
 * directory sandbox that is honest about its limits, a vendor-neutral agent
 * driver port, and run registration (D36).
 *
 * From Stage 3 it also carries the mechanism ADR-0005 deferred to this stage --
 * a namespace sandbox that can actually prove `process` and `network` -- and the
 * primary agent's real driver. `drivers/codex.ts` remains Stage 8's.
 */

export * from './doctor.ts';
export * from './isolation.ts';
export * from './sandbox.ts';
export * from './driver.ts';
export * from './run-registry.ts';
export * from './graders.ts';
export * from './budget.ts';
export * from './collect.ts';
export * from './trial.ts';
export * from './ns-sandbox.ts';
export * from './drivers/claude-code.ts';
export {
  httpRegisterRun,
  registerWithPlane,
  type RegisterRunTransport,
  type RegistrationResult,
} from './plane-registrar.ts';
export { httpIngest, servePlaneProxy, type PlaneProxy } from './plane-ingest.ts';
