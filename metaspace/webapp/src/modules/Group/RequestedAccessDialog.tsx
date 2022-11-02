import { defineComponent } from '@vue/composition-api'
import { Dialog } from '../../lib/element-ui'
import './RequestedAccessDialog.scss'

interface RequestedAccessDialogProps {
  visible: boolean
  dsSubmission: boolean
  group: any
}

export const RequestedAccessDialog = defineComponent<RequestedAccessDialogProps>({
  name: 'RequestedAccessDialog',
  props: {
    visible: { type: Boolean, default: true },
    dsSubmission: { type: Boolean, default: false },
    group: { type: Object },
  },
  setup(props, ctx) {
    const { emit, root } = ctx

    const handleClose = () => {
      emit('close')
    }

    return () => {
      const {
        visible,
        group,
        dsSubmission,
      } = props
      const groupAdmins = group
        ? group.members.filter((member: any) => member.role === 'GROUP_ADMIN') : []

      return (
        <Dialog
          class='requested-access-dialog'
          visible={visible}
          append-to-body
          title={`${group?.name} Access Request`}
          lockScroll={false}
          onClose={handleClose}>
          {
            dsSubmission ? 'Your dataset was sent to processing. ' : 'Your request was sent. '
          }
          Please contact
          {
            groupAdmins.map((member: any,
              memberIdx: number) => {
              return <span key={member.user.id} class='ml-1'>
                {member.user.email ? <a href={`mailto:${member.user.email}`}>{member.user.name}</a>
                  : member.user.name}
                {memberIdx < groupAdmins.length - 2 ? ',' : ''}
                {memberIdx === groupAdmins.length - 2 ? ' or' : ''}
                {memberIdx === groupAdmins.length - 1 ? ' ' : ''}
              </span>
            },
            )
          }
          to approve your request within METASPACE, so you can visualize the group datasets!
        </Dialog>
      )
    }
  },
})
