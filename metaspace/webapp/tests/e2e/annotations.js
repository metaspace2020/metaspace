import config from '../../conf';

import {Selector} from 'testcafe';

const DATA_WAIT = 10000;

fixture `Annotations page`
  .page `http://${config.HOST_NAME}:${config.PORT}/#/annotations`;

const table = new Selector('#annot-table');
const filterPanel = new Selector('#annot-page .filter-panel');

const tableBody = table.find('tbody').addCustomMethods({
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
});

const rows = table.find('tbody>tr');
const header = table.find('thead>tr').nth(0);

function findSortIcon(colIndex, direction) {
  return header.find('th').nth(colIndex)
               .find('i.sort-caret.' + direction);
}

test('table is not empty', async t => {
  await t.wait(DATA_WAIT); // wait until the data loads
  const rowCount = await table.find('tbody>tr').count;
  await t
    .expect(rowCount >= 10).ok();
});

test('total number of matching entries is shown', async t => {
  const count = await new Selector('#annot-count b').textContent;
  await t.expect(count != '').ok();
});

test('there are 6 columns initially', async t => {
  await t.wait(DATA_WAIT);
  const firstRow = await rows.nth(0);
  await t.expect(firstRow.find('td').count).eql(6);
});

test('single-click lab filtering works', async t => {
  const labCell = await rows.nth(0).find('td').nth(0);
  const filterIcon = await labCell.find('img').nth(0);
  await t.hover(labCell);
  await filterIcon.visible;
  await t
    .click(filterIcon)
    .expect(rows.nth(0).find('td').count).eql(5);
});

test('single-click dataset filtering works', async t => {
  const datasetCell = await rows.nth(0).find('td').nth(1);
  const filterIcon = await datasetCell.find('img').nth(0);
  await t.hover(datasetCell);
  await filterIcon.visible;
  await t
    .click(filterIcon)
    .expect(rows.nth(0).find('td').count).eql(4);
});

test('sorting works', async t => {
  await t.wait(DATA_WAIT); // wait for handlers to get attached

  for (let colIndex of [3, 4]) {
    for (let direction of ['ascending', 'descending']) {
      await t.click(findSortIcon(colIndex, direction)).wait(500);

      const values = await tableBody.column(colIndex);
      const expected = await tableBody.sortedColumn(colIndex, direction);
      await t.expect(values).eql(expected);
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

  // database, FDR, dataset, molecule
  await t.expect(filterPanel.find('.tf-outer').count).eql(4);
});
