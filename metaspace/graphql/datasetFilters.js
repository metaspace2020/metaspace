/**
 * Created by intsco on 2/8/17.
 */

const capitalize = require('lodash/capitalize');

class AbstractDatasetFilter {
  constructor(schemaPath, options) {
    this.schemaPath = schemaPath;
    this.options = options;
    
    this.esField = 'ds_meta.' + this.schemaPath;
    
    const pathElements = this.schemaPath.replace(/\./g, ',');
    this.pgField = "metadata#>>'{" + pathElements + "}'";
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
    return q.whereRaw(this.pgField + ' LIKE ?', ['%' + this.preprocess(value) + '%']);
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

const datasetFilters = {
  institution: new ExactMatchFilter('Submitted_By.Institution', {}),
  polarity: new PhraseMatchFilter('MS_Analysis.Polarity', {preprocess: capitalize}),
  ionisationSource: new PhraseMatchFilter('MS_Analysis.Ionisation_Source', {}),
  analyzerType: new ExactMatchFilter('MS_Analysis.Analyzer', {}),
  organism: new ExactMatchFilter('Sample_Information.Organism', {}),
  maldiMatrix: new ExactMatchFilter('Sample_Preparation.MALDI_Matrix', {})
};

function dsField(pgDatasetRecord, alias){
  let info = pgDatasetRecord.metadata;
  for (let field of datasetFilters[alias].schemaPath.split("."))
    info = info[field];
  return info;
};

module.exports = {
  AbstractDatasetFilter,
  ExactMatchFilter,
  PhraseMatchFilter,
  SubstringMatchFilter,

  datasetFilters,
  dsField
};
