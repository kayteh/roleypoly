import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link, Prompt } from 'react-router-dom'
import * as UIActions from '../../actions/ui'
import { msgToReal } from '../../utils'
import * as Actions from './actions'
import Category from './Category'
import './RolePicker.sass'
import { GoTrashcan, GoCheck, GoPencil } from 'react-icons/go'

const mapState = ({ rolePicker, servers }, ownProps) => {
  return {
    data: rolePicker,
    server: servers.get(ownProps.match.params.server),
  }
}

class RolePicker extends Component {
  componentDidMount() {
    const {
      dispatch,
      match: {
        params: { server },
      },
    } = this.props
    dispatch(Actions.setup(server))
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.match.params.server !== nextProps.match.params.server) {
      const { dispatch } = this.props
      dispatch(
        UIActions.fadeOut(() => dispatch(Actions.setup(nextProps.match.params.server)))
      )
    }
  }

  get serverId() {
    return this.props.server.get('id')
  }

  isSelected = (id) => {
    return this.props.data.getIn(['rolesSelected', id])
  }

  get rolesHaveChanged() {
    const { data } = this.props
    return !data.get('rolesSelected').equals(data.get('originalRolesSelected'))
  }

  editServerMessage = (e) => {
    const { dispatch } = this.props
    dispatch(Actions.editServerMessage(this.serverId, e.target.value))
  }

  saveServerMessage = (e) => {
    const { dispatch } = this.props
    dispatch(Actions.saveServerMessage(this.serverId))
  }

  openMessageEditor = () => {
    const { dispatch } = this.props
    dispatch(Actions.openMessageEditor(this.serverId))
  }

  closeMessageEditor = () => {
    const { dispatch } = this.props
    dispatch(Actions.closeMessageEditor)
  }

  renderServerMessage(server) {
    const isEditing = this.props.data.get('isEditingMessage')
    const roleManager = server.getIn(['perms', 'canManageRoles'])
    const msg = server.get('message')
    const msgBuffer = this.props.data.get('messageBuffer')

    if (!roleManager && msg !== '') {
      return (
        <section>
          <h3>Server Message</h3>
          <p dangerouslySetInnerHTML={{ __html: msgToReal(msg) }}></p>
        </section>
      )
    }

    if (roleManager && !isEditing) {
      return (
        <section>
          <div className="role-picker__header">
            <h3>Server Message</h3>
            <div
              uk-tooltip=""
              title="Edit Server Message"
              onClick={this.openMessageEditor}
            >
              <GoPencil className="smol-bump" />
            </div>
          </div>
          <p
            dangerouslySetInnerHTML={{
              __html: msgToReal(msg) || '<i>no server message</i>',
            }}
          ></p>
        </section>
      )
    }

    if (roleManager && isEditing) {
      return (
        <section>
          <div className="role-picker__header">
            <h3>Server Message</h3>
            <div
              uk-tooltip=""
              title="Save Server Message"
              onClick={this.saveServerMessage}
              style={{ cursor: 'pointer', color: 'var(--c-green)', fontSize: '1.4rem' }}
            >
              <GoCheck className="smol-bump" />
            </div>
            <div
              uk-tooltip=""
              title="Discard Edits"
              onClick={this.closeMessageEditor}
              style={{
                cursor: 'pointer',
                color: 'var(--c-red)',
                marginLeft: 10,
                fontSize: '0.9rem',
              }}
            >
              <GoTrashcan className="smol-bump" />
            </div>
          </div>
          <textarea
            className="uk-width-1-2 uk-textarea role-picker__msg-editor"
            rows="3"
            onChange={this.editServerMessage}
            value={msgBuffer}
          />
        </section>
      )
    }

    return null
  }

  render() {
    const { data, server, dispatch } = this.props
    const vm = data.get('viewMap')

    if (server === undefined) {
      return null
    }

    return (
      <div className={`inner role-picker ${data.get('hidden') ? 'hidden' : ''}`}>
        <Prompt
          when={this.rolesHaveChanged}
          message="Are you sure you want to leave? You have unsaved changes that will be lost."
        />
        {this.renderServerMessage(server)}
        <section>
          <div className="role-picker__header sticky">
            <h3>Roles</h3>
            {server.getIn(['perms', 'canManageRoles']) === true ? (
              <Link
                to={`/s/${server.get('id')}/edit`}
                uk-tooltip=""
                title="Edit Categories"
                style={{ color: 'var(--c-7)' }}
              >
                <GoPencil className="smol-bump" />
              </Link>
            ) : null}
            <div className="role-picker__spacer"></div>
            <div
              className={`role-picker__actions ${!this.rolesHaveChanged ? 'hidden' : ''}`}
            >
              <button
                disabled={!this.rolesHaveChanged}
                onClick={() => dispatch(Actions.resetSelected)}
                className="uk-button rp-button secondary"
              >
                Reset
              </button>
              <button
                disabled={!this.rolesHaveChanged || data.get('lockedInteractions')}
                onClick={() =>
                  dispatch(Actions.submitSelected(this.props.match.params.server))
                }
                className="uk-button rp-button primary"
              >
                Save Changes
              </button>
            </div>
          </div>
          <div className="role-picker__categories">
            {vm
              .sortBy((v) => v.get('position'))
              .map((c, name) => (
                <Category
                  key={name}
                  name={name}
                  category={c}
                  isSelected={this.isSelected}
                  onChange={(roles) => dispatch(Actions.updateRoles(roles))}
                />
              ))
              .toArray()}
          </div>
        </section>
      </div>
    )
  }
}

export default connect(mapState)(RolePicker)
