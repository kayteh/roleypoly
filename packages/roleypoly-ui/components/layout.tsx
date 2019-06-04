import * as React from 'react'
import GlobalColors from './global-colors'
import SocialCards from './social-cards'
import HeaderBar from '../containers/header-bar'
import { User } from '../stores/user'
import styled from 'styled-components'
import Router from 'next/router'

const LayoutWrapper = styled.div`
  transition: opacity 0.1s ease-out;
  opacity: 0;

  .wf-active &,
  .force-active & {
    opacity: 1;
  }
`

const ContentBox = styled.div`
  margin: 0 auto;
  width: 960px;
  max-width: 100vw;
  padding: 5px;
  padding-top: 50px;
`

const Layout = ({ children, user, noBackground, router }: {children: React.ReactElement<any>, user: User, noBackground: boolean, router: typeof Router }) => <>
  <GlobalColors />
  <SocialCards />
  <LayoutWrapper>
    <HeaderBar user={user} noBackground={noBackground} router={router} />
    <ContentBox>
      {children}
    </ContentBox>
  </LayoutWrapper>
</>

export default Layout