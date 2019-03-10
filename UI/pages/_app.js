import * as React from 'react'
import App, { Container } from 'next/app'
import Head from 'next/head'
import GlobalColors from '../components/global-colors'
import SocialCards from '../components/social-cards'
// import RPCClient from '../rpc'

class RoleypolyApp extends App {
  static async getInitialProps ({ Component, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }

  componentDidMount () {
    this.loadTypekit(document)
    this.waitForFOUC()
  }

  loadTypekit (d) {
    var config = {
      kitId: 'bck0pci',
      scriptTimeout: 1500,
      async: true
    }
    const h = d.documentElement
    const t = setTimeout(function () { h.className = h.className.replace(/\bwf-loading\b/g, '') + ' wf-inactive' }, config.scriptTimeout)
    const tk = d.createElement('script')
    const s = d.getElementsByTagName('script')[0]
    let f = false
    let a
    h.className += ' wf-loading'
    tk.src = 'https://use.typekit.net/' + config.kitId + '.js'
    tk.async = true
    tk.onload = tk.onreadystatechange = function () {
      a = this.readyState
      if (f || (a && a !== 'complete' && a !== 'loaded')) return
      f = true
      clearTimeout(t)
      try { window.Typekit.load(config) } catch (e) {}
    }
    s.parentNode.insertBefore(tk, s)
  }

  // wait one second, add FOUC de-protection.
  waitForFOUC () {
    setTimeout(() => {
      document.documentElement.className += ' force-active'//
    }, 1500)
  }

  render () {
    const { Component, pageProps, router, rpc } = this.props

    return (
      <Container>
        <noscript>Hey there. Unfortunately, we require JS for this app to work. Please take this rose as retribution. 🌹</noscript>
        <Head>
          <meta charSet='utf-8' />
          <title key='title'>Roleypoly</title>
          <meta name='viewport' content='width=device-width, initial-scale=1' />
        </Head>
        <GlobalColors />
        <SocialCards />
        <Component {...pageProps} router={router} rpc={rpc} />
      </Container>
    )
  }
}

export default RoleypolyApp
