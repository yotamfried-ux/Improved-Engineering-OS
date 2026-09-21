# nemotron — legacy compatibility redirect

> Nemotron is not an Engineering OS skill. It is an LLM execution engine / backend.
>
> Canonical owner: [`../../external-systems/nvidia-nemotron/`](../../external-systems/nvidia-nemotron/)

This directory is kept only as a compatibility pointer for older references. Do not add Nemotron to the active skill registry and do not treat these files as SIP skill policy.

Use:

- [`../../external-systems/nvidia-nemotron/README.md`](../../external-systems/nvidia-nemotron/README.md) — engine identity and provider reference
- [`../../external-systems/nvidia-nemotron/orchestration.md`](../../external-systems/nvidia-nemotron/orchestration.md) — when and how Claude may call the engine
- [`../../external-systems/nvidia-nemotron/activation.md`](../../external-systems/nvidia-nemotron/activation.md) — activation and verification
- `.claude/agents/nemotron-*` — runtime adapters to the engine

Important boundary: a raw Nemotron review is first-pass review only. It is separate from the mandatory `/security-review` gate.
