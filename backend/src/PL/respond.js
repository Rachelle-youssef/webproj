// PL: every successful reply has the same shape: { "data": ... } and, for lists, "meta".
'use strict';

const ok = (res, data, meta) =>
  res.status(200).json(
    meta
      ? {
          data,
          meta
        }
      : {
          data
        }
  );
/** Sends a PageDTO as { data: [...], meta: {...} }. */
const page = (res, pageDto) => ok(res, pageDto.items, pageDto.meta);
const created = (res, data) =>
  res.status(201).json({
    data
  });
const noContent = (res) => res.status(204).end();
module.exports = {
  ok,
  page,
  created,
  noContent
};
