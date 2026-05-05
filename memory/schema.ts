/**
 * memory/schema.ts — Phase 0: Six-Memory Architecture Schema
 *
 * Defines the typed AtomSpace mapping for all six memory subsystems.
 * Each subsystem is assigned a Matula prime as its eternal name, so that
 * addressing, content-hashing, and structural similarity collapse to a
 * single integer per the echo-master convention.
 *
 * Matula prime assignments for the memory subsystems:
 *
 *  Subsystem              Matula
 *  ─────────────────────  ──────
 *  Episodic               2
 *  Semantic               3
 *  Procedural             5
 *  Participatory          7
 *  Declarative            11
 *  Working                13
 *
 * (These are the six smallest primes — the roots of the forest —
 *  which makes their product the "seed" of the memory system.)
 */

/** A Matula prime used as an eternal, collision-free name. */
export type MatulaPrime = number & { readonly __matulaPrime: true };

function asMatulaPrime(n: number): MatulaPrime {
  return n as MatulaPrime;
}

/** The six memory subsystem identifiers. */
export const MemorySubsystem = {
  Episodic: "episodic",
  Semantic: "semantic",
  Procedural: "procedural",
  Participatory: "participatory",
  Declarative: "declarative",
  Working: "working",
} as const;

export type MemorySubsystemId =
  (typeof MemorySubsystem)[keyof typeof MemorySubsystem];

/** Matula prime eternal names for the six memory subsystems. */
export const SUBSYSTEM_MATULA: Readonly<Record<MemorySubsystemId, MatulaPrime>> =
  {
    [MemorySubsystem.Episodic]: asMatulaPrime(2),
    [MemorySubsystem.Semantic]: asMatulaPrime(3),
    [MemorySubsystem.Procedural]: asMatulaPrime(5),
    [MemorySubsystem.Participatory]: asMatulaPrime(7),
    [MemorySubsystem.Declarative]: asMatulaPrime(11),
    [MemorySubsystem.Working]: asMatulaPrime(13),
  };

/** The product of all six subsystem primes — the "seed" of the memory forest. */
export const MEMORY_SEED: number = Object.values(SUBSYSTEM_MATULA).reduce(
  (acc, p) => acc * p,
  1,
);

/**
 * A typed atom in the AtomSpace.
 *
 * Every atom has:
 * - `name`       — Matula prime as its eternal name
 * - `subsystem`  — which of the six memory systems owns it
 * - `payload`    — domain-specific data (episodic episode, semantic node, etc.)
 * - `links`      — prime-product encoding the structural links (0 = leaf)
 */
export interface MemoryAtom<P = unknown> {
  /** Eternal Matula prime identifier. */
  readonly name: MatulaPrime;
  /** The subsystem this atom belongs to. */
  readonly subsystem: MemorySubsystemId;
  /** Domain-specific payload. */
  readonly payload: P;
  /**
   * Structural links expressed as a product of the Matula primes of
   * linked atoms.  A value of 0 indicates a leaf (no links).
   */
  readonly links: number;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
}

/** Factory — creates a MemoryAtom with current timestamp. */
export function makeAtom<P>(
  name: MatulaPrime,
  subsystem: MemorySubsystemId,
  payload: P,
  linkedNames: ReadonlyArray<MatulaPrime> = [],
): MemoryAtom<P> {
  const links =
    linkedNames.length === 0
      ? 0
      : linkedNames.reduce((acc, p) => acc * p, 1);
  return {
    name,
    subsystem,
    payload,
    links,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Decode a `links` product back into the set of constituent Matula primes.
 *
 * Uses trial-division up to the known subsystem primes and the module
 * primes in the echo-master report.  For atoms whose links encode only
 * subsystem-root primes this is exact.
 */
export function decodeLinks(links: number): ReadonlyArray<MatulaPrime> {
  if (links <= 1) return [];
  const factors: MatulaPrime[] = [];
  let remaining = links;
  // Trial-divide by small primes; the domain never uses primes > 137.
  const candidates = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47,
    53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131,
    137];
  for (const p of candidates) {
    while (remaining % p === 0) {
      factors.push(asMatulaPrime(p));
      remaining = remaining / p;
    }
    if (remaining === 1) break;
  }
  return factors;
}

/** Simple in-memory AtomSpace (Phase 0 backing store). */
export class AtomSpace {
  private readonly _atoms = new Map<MatulaPrime, MemoryAtom>();

  /** Insert or replace an atom. */
  insert(atom: MemoryAtom): void {
    this._atoms.set(atom.name, atom);
  }

  /** Look up an atom by Matula prime. */
  get(name: MatulaPrime): MemoryAtom | undefined {
    return this._atoms.get(name);
  }

  /** All atoms in this space. */
  all(): ReadonlyArray<MemoryAtom> {
    return Array.from(this._atoms.values());
  }

  /** Atoms belonging to a specific subsystem. */
  bySubsystem(subsystem: MemorySubsystemId): ReadonlyArray<MemoryAtom> {
    return this.all().filter((a) => a.subsystem === subsystem);
  }

  /** Number of atoms. */
  get size(): number {
    return this._atoms.size;
  }
}
