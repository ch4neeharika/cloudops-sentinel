export function toPublicId(doc: { _id: { toString(): string } }): string {
  return doc._id.toString();
}

export function serialize<T extends { _id: { toString(): string }; toObject?: () => object }>(
  doc: T,
): Record<string, unknown> {
  const raw = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const {
    _id,
    __v: _v,
    passwordHash: _passwordHash,
    tokenHash: _tokenHash,
    ...rest
  } = raw as Record<string, unknown> & {
    _id: { toString(): string };
  };
  return { id: _id.toString(), ...rest };
}

export function paginate<T>(items: T[], page: number, limit: number, total: number) {
  return { items, page, limit, total };
}
