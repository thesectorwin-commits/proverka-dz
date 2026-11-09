// Общий "флаг" между components/CropSelector.tsx и components/PullToRefresh.tsx.
//
// Проблема: PullToRefresh слушает touchstart/touchmove/touchend на window
// независимо от того, что происходит внутри CropSelector — перетаскивание
// полосы/маркера вниз от самого верха экрана (scrollY===0, где обычно и
// находится сама рамка выбора задания) выглядело для PullToRefresh как
// обычный жест "потянуть вниз для обновления" и вызывало
// window.location.reload(), сбрасывая весь экран "Подсказать" обратно на
// загрузку фото. CropSelector использует Pointer Events, а PullToRefresh —
// нативные Touch Events; stopPropagation() на одном НЕ останавливает
// другой (это два независимых потока событий браузера для одного и того
// же касания), поэтому нужен отдельный, явный сигнал между компонентами.
let activeDrags = 0;

export function beginTouchDrag() {
  activeDrags++;
}

export function endTouchDrag() {
  activeDrags = Math.max(0, activeDrags - 1);
}

export function isTouchDragActive() {
  return activeDrags > 0;
}
