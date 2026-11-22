// Swipe left on a row to delete it (with undo in the toast). Buttons inside still get taps.

export function attachSwipe(row, onDelete) {
  const fg = row.querySelector('.swipe-fg');
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let tracking = false;
  let horizontal = null;

  row.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.toggle')) return;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    tracking = true;
    horizontal = null;
  });
  row.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    const mx = e.clientX - startX;
    const my = e.clientY - startY;
    if (horizontal === null && Math.abs(mx) + Math.abs(my) > 10) horizontal = Math.abs(mx) > Math.abs(my);
    if (!horizontal) return;
    dx = Math.min(0, mx);
    fg.style.transform = `translateX(${dx}px)`;
  });
  const end = () => {
    if (!tracking) return;
    tracking = false;
    const width = row.offsetWidth || 1;
    if (horizontal && dx < -width * 0.35) {
      fg.style.transform = `translateX(-${width}px)`;
      setTimeout(onDelete, 150);
    } else {
      fg.style.transform = '';
    }
  };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', end);
  // A finished swipe must not also count as a tap on "edit".
  row.addEventListener(
    'click',
    (e) => {
      if (horizontal && Math.abs(dx) > 10) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );
}
