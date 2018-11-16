import {DatasetUserSource, FieldResolversFor} from '../../../bindingTypes';
import {DatasetUser} from '../../../binding';
import canSeeUserEmail from '../../user/util/canSeeUserEmail';

const DatasetUser: FieldResolversFor<DatasetUser, DatasetUserSource> = {
  email(source) {
    return canSeeUserEmail(source.scopeRole) ? source.email : null;
  }
};

export default DatasetUser;
