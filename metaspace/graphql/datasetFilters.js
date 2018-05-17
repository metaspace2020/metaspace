const capitalize = require('lodash/capitalize');

function getPgField(schemaPath) {
  const pathElements = schemaPath.replace(/\./g, ',');
  return "metadata#>>'{" + pathElements + "}'";
}

class AbstractDatasetFilter {
  constructor(schemaPath, options) {
    this.schemaPath = schemaPath;
    this.options = options;

    this.esField = options.esField || ('ds_meta.' + this.schemaPath);
    this.pgField = options.pgField || getPgField(this.schemaPath);
  }

  preprocess(val) {
    if (this.options.preprocess)
      return this.options.preprocess(val);
    return val;
  }

  esFilter(value) {}
  pgFilter(q, value) {}
}

class ExactMatchFilter extends AbstractDatasetFilter {
  constructor(schemaPath, options) {
    super(schemaPath, options);
  }

  esFilter(value) {
    return {term: {[this.esField]: this.preprocess(value)}}
  }

  pgFilter(q, value) {
    return q.whereRaw(this.pgField + ' = ?', [this.preprocess(value)]);
  }
}

class SubstringMatchFilter extends AbstractDatasetFilter {
  constructor(schemaPath, options) {
    super(schemaPath, options);
  }

  esFilter(value) {
    return {wildcard: {[this.esField]: `*${this.preprocess(value)}*`}}
  }

  pgFilter(q, value) {
    return q.whereRaw(this.pgField + ' ILIKE ?', ['%' + this.preprocess(value) + '%']);
  }
}

class PhraseMatchFilter extends SubstringMatchFilter {
  constructor(schemaPath, options) {
    super(schemaPath, options);
  }

  esFilter(value) {
    return {match: {[this.esField]: {query: this.preprocess(value), type: 'phrase'}}}
  }
}

class DatasetIdFilter extends AbstractDatasetFilter {
  constructor() {
    super('', {});
  }

  esFilter(ids) {
    // FIXME: array filter doesn't work presumably because of bugs in apollo-server
    ids = ids.split("|");

    if (ids.length > 0)
      return {terms: {ds_id: ids}};
    else
      return {};
  }

  pgFilter(q, ids) {
    ids = ids.split("|");
    return q.whereIn('id', ids);
  }
}

class PersonFilter extends AbstractDatasetFilter {
  constructor(schemaPath) {
    super(schemaPath, {});
    this.pgNameField = getPgField(schemaPath + '.First_Name');
    this.pgSurnameField = getPgField(schemaPath + '.Surname');
  }

  esFilter({name, surname}) {
    return [
      // TODO: make these not_analyzed
      {term: {[this.esField + '.First_Name']: name}},
      {term: {[this.esField + '.Surname']: surname}}
    ];
  }

  pgFilter(q, {name, surname}) {
    return q.whereRaw(`${this.pgNameField} = ? AND ${this.pgSurnameField} = ?`,
        [name, surname]);
  }
}

const datasetFilters = {
  institution: new ExactMatchFilter('Submitted_By.Institution', {}),
  polarity: new PhraseMatchFilter('MS_Analysis.Polarity', {preprocess: capitalize}),
  ionisationSource: new ExactMatchFilter('MS_Analysis.Ionisation_Source', {}),
  analyzerType: new PhraseMatchFilter('MS_Analysis.Analyzer', {}),
  organism: new ExactMatchFilter('Sample_Information.Organism', {}),
  organismPart: new ExactMatchFilter('Sample_Information.Organism_Part', {}),
  condition: new ExactMatchFilter('Sample_Information.Condition', {}),
  growthConditions: new ExactMatchFilter('Sample_Information.Sample_Growth_Conditions', {}),
  maldiMatrix: new ExactMatchFilter('Sample_Preparation.MALDI_Matrix', {}),
  name: new SubstringMatchFilter('', {esField: 'ds_name', pgField: 'name'}),
  ids: new DatasetIdFilter(),
  status: new ExactMatchFilter('', {esField: 'ds_status', pgField: 'status'}),
  submitter: new PersonFilter('Submitted_By.Submitter'),
  metadataType: new ExactMatchFilter('Data_Type', {}),
}

function dsField(hit, alias){
  let info = hit._source.ds_meta;
  for (let field of datasetFilters[alias].schemaPath.split(".")) {
    info = info[field];
    if (!info)
      return info;
  }
  return info;
}

module.exports = {
  AbstractDatasetFilter,
  ExactMatchFilter,
  PhraseMatchFilter,
  SubstringMatchFilter,
  DatasetIdFilter,
  PersonFilter,

  datasetFilters,
  dsField,
  getPgField
};
