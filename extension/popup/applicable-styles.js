function masterEnable(event) {
  browser.runtime.sendMessage({'enableMaster': event.target.checked})
  .catch(e => console.log(e));
}

function enableStyle(event) {
  browser.runtime.sendMessage({
    'enableStyle': {
      'name': event.target.dataset.name,
      'enabled': event.target.checked}})
  .catch(e => console.log(e));
}

browser.runtime.sendMessage({'populate': {}})
.then(({masterEnabled, styles}) => {
  Object.assign(document.querySelector('#master'),
    {checked: masterEnabled, onclick: masterEnable});
  var template = document.querySelector('#style-item');
  var list = document.querySelector('.panel-section-list');
  styles.map(({name, enabled}, i) => {
    var item = document.importNode(template.content, true);
    var checkbox = item.querySelector('.panel-list-item input');
    Object.assign(checkbox,
      {id: 's' + i, checked: enabled, onclick: enableStyle});
    checkbox.dataset.name = name;
    Object.assign(item.querySelector('.panel-list-item label'),
      {htmlFor: 's' + i, textContent: name});
    return item;
  }).forEach(item => list.appendChild(item));
})
.catch(e => console.log(e))
