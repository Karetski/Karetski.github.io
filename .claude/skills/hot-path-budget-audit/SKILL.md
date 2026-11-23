---
name: hot-path-budget-audit
description: Static audit of a latency-critical path for blocking IO, allocations, unbounded work, and per-iteration budget violations. Use when adding or changing code on a hot path (a game or simulation tick, a render frame, a request handler, an event-loop callback, an inner loop) or when investigating gradual performance degradation. Enumerates the path, flags forbidden operations per function, bounds each unit of work, estimates worst-case cost, and returns a green/yellow/red verdict per unit. A per-iteration time budget is one of the hardest properties to hold, because violating it rarely fails a test — it degrades under load.
context: fork
agent: general-purpose
---

# hot-path-budget-audit

A hot path runs on a fixed budget: N milliseconds per tick, per frame,
per request, per callback. Violations don't surface as test failures —
they surface as gradual stutter, tail-latency creep, or throughput
collapse that only appears under real load, after which they're
expensive to root-cause. Static audit is cheaper than reactive
profiling.

Two ideas ground this audit. Data layout is the design: choose the
layout so hot walks are allocation-free (arena-backed handles and typed
enums over boxed trait objects and per-call collections), rather than
bolting on optimization later. And a hot path stays quiet: no
instrumentation span belongs there without re-confirming it adds zero
allocations. The green/yellow/red verdict below is a static estimate;
the durable proof is an invariant test — a counting-allocator pin or a
bounded-depth pin — that fails the build when the property breaks.

## Across languages

The spine — **bounded work per iteration, no blocking IO on the path, no
unbounded scan** — holds in every language. What the "forbidden operations"
look like differs, so read step 2 through the right lens:

- **Systems / no-GC (Rust, C++, Zig):** inner-loop allocations, boxed trait
  objects on a hot walk, and locks held across `await` are the classic
  offenders; the durable proof is a counting-allocator invariant. The framing
  below is native here.
- **GC languages (JS/TS, Python, Java, Go, Swift, Kotlin):** you rarely
  hand-audit individual allocations — the GC changes that analysis. The
  offenders that actually bite: blocking / synchronous IO in a request handler
  or render, **N+1 queries**, unbounded fan-out or full-table/collection scans,
  **re-render storms** and recomputing derived state every frame/tick, and
  awaiting backpressure inline. Allocation pressure still matters at scale (GC
  pause time), but as "don't allocate megabytes per request," not "zero
  allocations per iteration."

On a GC path the durable proof isn't a counting-allocator pin but an assertion
on the *observable* cost: a query-count test (assert the handler issues exactly
one query, not N), a bounded-concurrency check, or a p99-latency regression
snapshot in CI. Pin the property that would actually degrade, in the terms your
runtime exposes.

Keep the bounded-work / no-blocking-IO / no-unbounded-scan checks everywhere;
treat the zero-allocation, arena-layout, and boxed-trait-object items as
systems-specific and skip them on a GC-language path.

## What this skill does

1. **Establish the budget and the path.** State the budget explicitly
   (e.g. "20 Hz tick = 50 ms/tick", "60 fps = 16 ms/frame", "p99 target
   = 100 ms/request"). Then enumerate the hot path: start from its
   entry point and walk every function called per iteration — including
   callbacks, observers, systems, and indirect dispatch. List them in
   execution order with their file paths.

2. **Per function, flag forbidden operations.** Many projects catch
   some of these at compile/lint time (a disallowed-methods lint, a
   `no-blocking-in-async` rule); humans still slip in the equivalents:
   - **Blocking / synchronous IO**: filesystem, network, DB queries,
     blocking HTTP clients, `acquire`/`lock` on a shared poolable
     resource. On an async hot path, none of these belong inline.
   - **Allocations in the inner loop**: fresh collections, string
     building, boxing inside an iteration over the working set. Hoist
     or reuse buffers.
   - **Unbounded iteration**: scanning the whole world/table/dataset
     when the work only needs a bounded neighbourhood, a spatial cell,
     an index lookup, or the subscribers of one channel.
   - **Locks held across `await`, and serialized awaits in a loop**: a
     lock spanning an await stalls an async path — flag both. On a
     request handler, awaiting IO is the *point*; the defect is a
     *serialized* await inside a per-item loop (the N+1 shape) — batch it
     or bound the concurrency (`Promise.all` over a capped batch), don't
     await one item at a time.
   - **Awaiting a full channel / backpressure inline**: a send that
     blocks when the queue is full stalls the whole path. Prefer a
     non-blocking `try_send` and count drops via a metric.
   - **Work that could be amortized**: anything rebuilt from scratch
     every iteration that could be cached and invalidated, or moved off
     the hot path entirely (to a background flusher / worker).

3. **Bound every new unit of work.** Interest/visibility work must use
   a spatial or indexed bound, not a full scan. Broadcasts must
   enumerate subscribers, never the whole population. Any per-iteration
   work must be provably bounded by something other than total dataset
   size.

4. **Estimate worst-case cost.** For each new or changed unit, write
   the worst case as "for N items, this is O(...) operations." Divide
   the budget by expected N to get a per-item ceiling, and check the
   estimate against it. Anything O(N²) on the working-set size is a
   yellow flag at small N and a red flag as N grows.

5. **Output a verdict per unit.**
   - 🟢 Green: bounded, no blocking IO, and no allocation that matters
     for the path's language — systems/no-GC: allocation-free in the
     inner loop; GC languages: no GC-pressuring allocation (an ordinary
     `push` or object literal is green).
   - 🟡 Yellow: allocates *at a scale that matters for the path's
     language* (systems/no-GC: any inner-loop allocation; GC languages:
     only allocation heavy enough to pressure the GC, e.g. megabytes per
     request — **not** an ordinary `push` or object literal); or, on a
     systems hot walk, dispatches through a boxed trait object / indirect
     vtable where a typed enum would inline; or has a documented "runs
     once per interval, not per iteration" exception.
   - 🔴 Red: unbounded, blocking, or does IO on the hot path. Must be
     fixed before merge.

   When a unit (each function or operation on the path) trips more than
   one tier, take the most severe: red > yellow > green.

## What earns a "must be fixed before merge"

A red verdict is non-negotiable. The remediation is almost always the
same: move the work off the hot path — behind a non-blocking queue to a
background worker, into a cache invalidated out-of-band, or into a
bounded index lookup — so the per-iteration budget is preserved.

## See also

Stands alone — the skills below are optional companions, not dependencies:
`architecture-canon` (the data-layout and hot-path-silence principles behind
it), `behavioral-testing` (the invariant test tier that pins the result), and
`principle-review` (the general review this specializes).
