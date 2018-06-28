import config from '../../conf';

import {ClientFunction, Selector} from 'testcafe';

fixture `Annotations page`
  .page `http://${config.HOST_NAME}:${config.PORT}/#/annotations`;

const table = new Selector('#annot-table');
const filterPanel = new Selector('#annot-page .filter-panel');

const tableMethods = {
  column: (tbl, columnIndex) =>
    Array.prototype.slice.call(tbl.rows, 0)
         .map(row => row.cells[columnIndex].innerText.trim()),

  sortedColumn: (tbl, columnIndex, direction) => {
    const values = Array.prototype.slice.call(tbl.rows, 0)
      .map(row => row.cells[columnIndex].innerText.trim());

    let compare;
    if (direction == 'ascending')
      compare = (a, b) => a - b;
    else
      compare = (a, b) => b - a;
    return values.slice().sort(compare);
  }
};

const tableBody = table.find('tbody').addCustomMethods(tableMethods);

const checkSortingOrder = ClientFunction((colIndex, direction) => {
  const tbl = tableBody();
  const values = tableMethods.column(tbl, colIndex);
  const expected = tableMethods.sortedColumn(tbl, colIndex, direction);
  return values.length == expected.length && values.every((v, i) => v == expected[i]);
},
{
  dependencies: { tableBody, tableMethods }
});

const rows = table.find('.el-table__body tr');
const header = table.find('.el-table__header tr').nth(0);

function findSortIcon(colIndex, direction) {
  return header.find('th').nth(colIndex)
               .find('span.sort-caret.' + direction);
}

test('table is not empty', async t => {
  await t.expect(rows.exists).ok();
  await t.expect(rows.count).gt(10);
});

test('total number of matching entries is shown', async t => {
  const count = await new Selector('#annot-count b').textContent;
  await t.expect(count).notEql('');
});

test('there are 6 columns initially', async t => {
  await t.expect(rows.exists).ok();
  const firstRow = await rows.nth(0);
  await t.expect(firstRow.find('td').count).eql(6);
});

test('single-click lab filtering works', async t => {
  await t.expect(rows.exists).ok();
  const labCell = await rows.nth(0).find('td').nth(0);
  const filterIcon = await labCell.find('img').nth(0);
  await t.hover(labCell);
  await t
    .click(filterIcon)
    .expect(rows.nth(0).find('td').count).eql(5);
});

test('single-click dataset filtering works', async t => {
  await t.expect(rows.exists).ok();
  const datasetCell = await rows.nth(0).find('td').nth(1);
  const filterIcon = await datasetCell.find('img').nth(0);
  await t.hover(datasetCell);
  await t
    .click(filterIcon)
    .expect(rows.nth(0).find('td').count).eql(4);
});

test('sorting works', async t => {
  await t.expect(rows.exists).ok();

  for (let colIndex of [3, 4]) {
    for (let direction of ['ascending', 'descending']) {
      await t.click(findSortIcon(colIndex, direction));
      const result = checkSortingOrder(colIndex, direction);
      await t.expect(result).ok();
    }
  }
});

// regression
test('user can add molecule filter after dataset filter', async t => {
  const datasetCell = await rows.nth(0).find('td').nth(1);
  const filterIcon = await datasetCell.find('img').nth(0);
  await t.hover(datasetCell).click(filterIcon);

  await t.click(filterPanel.find('.el-select'));
  await t.click(new Selector('.el-select-dropdown__item span').withText('Search molecule'));

  // database, FDR, dataset, molecule, search box
  await t.expect(filterPanel.find('.tf-outer').count).eql(5);
});
