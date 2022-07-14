function handleCustomCheckboxEvent(evt) {
  const { target, type } = evt;
  if (target.tagName === 'INPUT' && target.type === 'checkbox') {
    if (type === 'mouseup') {
      if (!target.disabled) {
        setTimeout(() => {
          target.classList.add('clicked');
        }, 200);
      }
    } else if (type === 'mousedown' || type === 'focusout') {
      target.classList.remove('clicked');
    }
  }
}

document.addEventListener('mouseup', handleCustomCheckboxEvent);
document.addEventListener('mousedown', handleCustomCheckboxEvent);
document.addEventListener('focusout', handleCustomCheckboxEvent);
