import { routerMiddleware } from 'react-router-redux'
import { applyMiddleware, compose, createStore } from 'redux'
import { createLogger } from 'redux-logger'
import thunk from 'redux-thunk'
import rootReducer from '../reducers'

const configureStore = (preloadedState, history) => {
  const store = createStore(
    rootReducer,
    preloadedState,
    compose(
      applyMiddleware(thunk, routerMiddleware(history), createLogger())
    )
  )

  if (module.hot) {
    // Enable Webpack hot module replacement for reducers
    module.hot.accept('../reducers', () => {
      store.replaceReducer(rootReducer)
    })
  }

  return store
}

export default configureStore
