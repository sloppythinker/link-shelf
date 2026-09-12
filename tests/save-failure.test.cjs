const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../js/store.js');

test('保存失敗時は変更を通知せず、追加・編集・削除・復元を巻き戻す', () => {
  let saved, fail = false, errors = 0, changes = 0;
  const store = createStore({getItem:()=>saved, setItem:(_,value)=>{ if (fail) throw new Error('quota'); saved=value; }}, ()=>errors++);
  const folder = store.addFolder('folder');
  const link = store.addLink({url:'https://example.com',tags:['old'],folderId:folder.id});
  store.subscribe(()=>changes++);
  const before = JSON.stringify(store.getData());
  const operations = [
    ()=>store.addLink({url:'https://new.example.com'}),
    ()=>store.updateLink(link.id,{title:'edited'}),
    ()=>store.deleteLink(link.id),
    ()=>store.renameTag('old','new'),
    ()=>store.deleteTag('old'),
    ()=>store.addFolder('new'),
    ()=>store.renameFolder(folder.id,'new'),
    ()=>store.deleteFolder(folder.id),
    ()=>store.importJSON({links:[],folders:[]},'replace'),
  ];
  fail=true;
  for (const mutate of operations) {
    assert.throws(mutate, {name:'StorageWriteError'});
    assert.equal(JSON.stringify(store.getData()), before);
  }
  assert.equal(changes,0);
  assert.equal(errors,operations.length);
});

test('復元プレビューでは現在データを変更せず件数を表示する',()=>{
  const store=createStore({getItem:()=>null,setItem(){}});
  store.addLink({url:'https://example.com'});
  const before=JSON.stringify(store.getData());
  assert.deepEqual(store.previewImport({links:[{url:'https://other.example.com'}],folders:[]},'merge'), {before:1,after:2,added:1,folders:0});
  assert.equal(JSON.stringify(store.getData()),before);
});
