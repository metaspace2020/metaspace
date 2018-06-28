import {HOST_NAME, PORT} from '../../conf';

import {Selector} from 'testcafe';

import fetch from 'node-fetch';
import {chdir} from 'process';
import {existsSync, mkdirSync, writeFileSync} from 'fs';
import {randomBytes} from 'crypto';

type UserInfo = {
    firstName: string
    surname: string
    email: string
}

class UploadForm {
    form: Selector
    submitButton: Selector
    fileUpload: Selector

    findField(label: string): Selector {
        return this.form.find('div.field-label').withText(label).parent();
    }

    textFieldInput(label: string): Selector {
        return this.findField(label).find('input');
    }

    textSubfieldInput(fieldLabel: string, subfieldLabel: string): Selector {
        return this.findField(fieldLabel).find('div.subfield-label')
            .withText(subfieldLabel).parent().find('input');
    }

    constructor () {
        this.form = Selector("form.el-form");
        this.submitButton = Selector('#md-editor-submit > button');
        this.fileUpload = Selector('input[type="file"]');
    }

    uploadImzML(t: TestController, imzmlFilename: string): TestControllerPromise {
        const ibdFilename = imzmlFilename.replace('.imzML', '.ibd');
        return t.setFilesToUpload(this.fileUpload, [imzmlFilename, ibdFilename]);
    }

    async setPolarity(t: TestController, polarity: string) {
        await t.click(this.findField('Polarity').find('.el-select'));
        await t.click(Selector('.el-select-dropdown__item > span').withText(polarity));
    }

    async fill(t: TestController, user: UserInfo) {
        // to speed things up a bit
        const opts = {replace: true, paste: true};

        await Promise.all([
            ['Organism', 'Rat'],
            ['Organism part', 'Brain'],
            ['Condition', 'none'],
            ['Sample stabilisation', 'none'],
            ['Tissue modification', 'none'],
            ['MALDI matrix', 'none'],
            ['MALDI matrix application', 'none'],
            ['Ionisation source', 'DESI'],
            ['Analyzer', 'Orbitrap'],
            ['Institution', 'EMBL']
        ].map(async ([field, value]) => {
            await t.typeText(this.textFieldInput(field), value, opts);
        }));

        await Promise.all([
            ['Detector resolving power', 'mz', '200'],
            ['Detector resolving power', 'resolving power', '140000'],
            ['Submitter', 'first name', user.firstName],
            ['Submitter', 'surname', user.surname],
            ['Submitter', 'email', user.email]
        ].map(async ([field, subfield, value]) => {
            await t.typeText(this.textSubfieldInput(field, subfield), value, opts);
        }));

        await this.setPolarity(t, 'Positive');
    }
}

async function downloadExampleData() {
    const remotePrefix = "https://github.com/metaspace2020/metaspace/blob/master/metaspace/engine/tests/data/imzml_example_ds/"
    let filenames = ["Example_Continuous.imzML", "Example_Continuous.ibd"];

    chdir('tests/e2e/');
    if (!existsSync('tmp'))
        mkdirSync('tmp');
    chdir('tmp/');
    filenames = filenames.filter(_ => !existsSync(_));

    return Promise.all(filenames.map(fn => {
        return fetch(remotePrefix + fn).then(resp => {
            writeFileSync(fn, resp.body);
        });
    }));
}

class DatasetsPage {
    findDataset(name: string): Selector {
        return Selector('.ds-info').withText(name);
    }
}

const uploadForm = new UploadForm();
const datasetsPage = new DatasetsPage();

fixture(`Upload page`)
    .page(`http://${HOST_NAME}:${PORT}/#/upload`)
    .beforeEach(async (t: TestController) => {
        const user: UserInfo = {
            firstName: 'Erica',
            surname: 'Mustermann',
            email: 'example@email.com'
        };
        await uploadForm.fill(t, user);
    });

test('submit button is disabled until dataset is uploaded', async (t: TestController) => {
    await t.expect(uploadForm.submitButton.hasClass('is-disabled')).ok();
});

test('submitted dataset appears in the Datasets tab', async (t: TestController) => {
    await downloadExampleData();
    await uploadForm.uploadImzML(t, "tmp/Example_Continuous.imzML")
        .expect(Selector(".qq-upload-success").count).eql(2);

    await t.expect(uploadForm.submitButton.hasClass('is-disabled')).notOk();

    const datasetName = randomBytes(5).toString('hex');
    const datasetNameField = uploadForm.textFieldInput('Dataset name');

    await t.expect(datasetNameField.value).eql('test');

    await t
        .typeText(datasetNameField, datasetName, {replace: true, paste: true})
        .click(uploadForm.submitButton)
        .navigateTo('/#/datasets')
        .expect(datasetsPage.findDataset(datasetName).exists).ok();
});
