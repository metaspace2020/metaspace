import { ProjectRole } from '../../api/project';
import { UserGroupRole } from '../../api/group';

export interface MembershipTableRow {
  id: string;
  name: string;
  role: UserGroupRole | ProjectRole;
  roleName: string;
  numDatasets: number;
}
