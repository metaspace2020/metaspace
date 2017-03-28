const capitalize = require('lodash/capitalize');

class AbstractDatasetFilter {
  constructor(schemaPath, options) {
    this.schemaPath = schemaPath;
    this.options = options;

    this.esField = options.esField || ('ds_meta.' + this.schemaPath);

    const pathElements = this.schemaPath.replace(/\./g, ',');
    this.pgField = options.pgField || ("metadata#>>'{" + pathElements + "}'");
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
      return {or: ids.map(id => ({term: {ds_id: id}}))};
    else
      return {};
  }

  pgFilter(q, ids) {
    ids = ids.split("|");
    return q.whereIn('id', ids);
  }
}

const datasetFilters = {
  institution: new ExactMatchFilter('Submitted_By.Institution', {}),
  polarity: new PhraseMatchFilter('MS_Analysis.Polarity', {preprocess: capitalize}),
  ionisationSource: new PhraseMatchFilter('MS_Analysis.Ionisation_Source', {}),
  analyzerType: new PhraseMatchFilter('MS_Analysis.Analyzer', {}),
  organism: new ExactMatchFilter('Sample_Information.Organism', {}),
  organismPart: new ExactMatchFilter('Sample_Information.Organism_Part', {}),
  condition: new ExactMatchFilter('Sample_Information.Condition', {}),
  maldiMatrix: new ExactMatchFilter('Sample_Preparation.MALDI_Matrix', {}),
  name: new SubstringMatchFilter('', {esField: 'ds_name', pgField: 'name'}),
  ids: new DatasetIdFilter()
};

function dsField(pgDatasetRecord, alias){
  let info = pgDatasetRecord.metadata;
  for (let field of datasetFilters[alias].schemaPath.split("."))
    info = info[field];
  return info;
}

module.exports = {
  AbstractDatasetFilter,
  ExactMatchFilter,
  PhraseMatchFilter,
  SubstringMatchFilter,
  DatasetIdFilter,

  datasetFilters,
  dsField
};
