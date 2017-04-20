import config from '../../conf';

import {Selector} from 'testcafe';

fixture `Annotations page`
  .page `http://${config.HOST_NAME}:${config.PORT}/#/annotations`;

const table = new Selector('#annot-table');

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
  await t.wait(3000); // wait until the data loads
  const rowCount = await table.find('tbody>tr').count;
  await t
    .expect(rowCount >= 10).ok();
});

test('total number of matching entries is shown', async t => {
  const count = await new Selector('#annot-count b').textContent;
  await t.expect(count != '').ok();
});

test('there are 6 columns initially', async t => {
  const firstRow = await rows.nth(0);
  await t.expect(firstRow.find('td').count).eql(6);
});

const cellHoverOptions = {offsetX: -10, offsetY: 10};

test('single-click lab filtering works', async t => {
  const labCell = await rows.nth(0).find('td').nth(0);
  await t
    .hover(labCell, cellHoverOptions)
    .click(labCell, cellHoverOptions)
    .expect(rows.nth(0).find('td').count).eql(5);
});

test('single-click dataset filtering works', async t => {
  const datasetCell = await rows.nth(0).find('td').nth(1);
  await t
    .hover(datasetCell, cellHoverOptions)
    .wait(10)
    .click(datasetCell, cellHoverOptions)
    .expect(rows.nth(0).find('td').count).eql(4);
});

test('sorting works', async t => {
  await t.wait(3000); // wait for handlers to get attached

  for (let colIndex of [3, 4]) {
    for (let direction of ['ascending', 'descending']) {
      await t.click(findSortIcon(colIndex, direction)).wait(500);

      const values = await tableBody.column(colIndex);
      const expected = await tableBody.sortedColumn(colIndex, direction);
      await t.expect(values).eql(expected);
    }
  }
});
