import { ContentSection } from '../components/content-section'
import { DisplayForm } from './display-form'

export function SettingsDisplay() {
  return (
    <ContentSection title='显示' desc='开关应用中需要显示的项目。'>
      <DisplayForm />
    </ContentSection>
  )
}
