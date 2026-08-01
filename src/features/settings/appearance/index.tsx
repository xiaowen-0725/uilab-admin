import { ContentSection } from '../components/content-section'
import { AppearanceForm } from './appearance-form'

export function SettingsAppearance() {
  return (
    <ContentSection
      title='外观'
      desc='自定义应用外观，可自动在浅色与深色主题间切换。'
    >
      <AppearanceForm />
    </ContentSection>
  )
}
