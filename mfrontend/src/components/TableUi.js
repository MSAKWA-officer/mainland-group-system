// Shared table look, identical to the one in features/stock/StockList.jsx:
// Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
export const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
export const HEAD = `${CELL} bg-white font-semibold uppercase`;
export const al = (i) => (i === 0 ? 'text-left' : 'text-center');
