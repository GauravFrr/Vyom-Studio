import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ScanFace, Clapperboard, Sparkles, ArrowRight, Users, Video, Image as ImageIcon } from 'lucide-react'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import useMotionPreference from '../../hooks/useMotionPreference'
import { SMOOTH_EASE, gridItemVariants } from '../../hooks/useHomeIntro'

const TOOLS = [
  {
    to: '/insta-pvt/transform',
    icon: ImageIcon,
    title: 'Pvt Transform · Photo',
    desc: 'Photo + prompt → exclusive Durex AI edit for feed-ready posts.',
    badge: 'Image',
    accent: '#EC4899',
  },
  {
    to: '/insta-pvt/transform-video',
    icon: Video,
    title: 'Pvt Transform · Video',
    desc: 'Clip + prompt → same Durex flow for private Instagram-style reels.',
    badge: 'Video',
    accent: '#F472B6',
  },
  {
    to: '/insta-pvt/face-image',
    icon: ScanFace,
    title: 'Face Copy · Image',
    desc: 'Scene reference + your model face → same pose & outfit, your influencer face.',
    badge: '2 images',
    accent: '#7C3AED',
  },
  {
    to: '/insta-pvt/face-video',
    icon: Clapperboard,
    title: 'Face Swap · Video',
    desc: 'Reference reel + model photo → your AI influencer performs the same motion.',
    badge: 'Video + face',
    accent: '#06B6D4',
  },
]

const pageStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: SMOOTH_EASE } },
}

export default function InstaPvtHub() {
  const reduce = useMotionPreference()
  const Root = reduce ? 'div' : motion.div
  const rootProps = reduce
    ? { className: 'space-y-10 lg:space-y-12 pb-6' }
    : { className: 'space-y-10 lg:space-y-12 pb-6', initial: 'hidden', animate: 'visible', variants: pageStagger }

  const Section = reduce ? 'section' : motion.section
  const sectionProps = reduce ? {} : { variants: fadeUp }

  return (
    <Root {...rootProps}>
      <Section {...sectionProps}>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill glass text-[10px] text-text-secondary uppercase tracking-widest mb-5">
          <span className="inline-flex rounded-full h-1.5 w-1.5 bg-pink-500 animate-pulse" />
          AI influencer studio
        </div>
        <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight mb-3">
          Insta <span className="text-gradient-violet">pvt</span> toolkit
        </h2>
        <p className="text-text-secondary max-w-2xl leading-relaxed">
          Build a consistent AI influencer — transform photos & reels with Durex, copy your face onto scenes, or swap your face into trending clips.
        </p>
      </Section>

      <Section {...sectionProps}>
        <motion.div
          variants={reduce ? undefined : { visible: { transition: { staggerChildren: 0.08 } } }}
          initial={reduce ? false : 'hidden'}
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 lg:gap-6"
        >
          {TOOLS.map((tool) => {
            const Icon = tool.icon
            const inner = (
              <Link to={tool.to} className="block h-full group">
                <Card interactive className="relative overflow-hidden h-full">
                  <div
                    className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-[0.15] pointer-events-none transition-opacity group-hover:opacity-25"
                    style={{ background: tool.accent }}
                  />
                  <div className="relative">
                    <div className="flex items-start justify-between mb-5">
                      <div
                        className="w-12 h-12 rounded-button flex items-center justify-center shadow-glow-violet-soft"
                        style={{ background: `linear-gradient(135deg, ${tool.accent}, #4F46E5)` }}
                      >
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <Badge color="violet">{tool.badge}</Badge>
                    </div>
                    <h3 className="font-display text-lg font-semibold text-text-primary mb-2">{tool.title}</h3>
                    <p className="text-sm text-text-secondary leading-relaxed mb-5">{tool.desc}</p>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-glow group-hover:gap-2.5 transition-all">
                      Open tool
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </Card>
              </Link>
            )
            if (reduce) return <div key={tool.to}>{inner}</div>
            return <motion.div key={tool.to} variants={gridItemVariants}>{inner}</motion.div>
          })}
        </motion.div>
      </Section>

      <Section {...sectionProps}>
        <Card className="bg-bg-elevated/40">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-button bg-accent/15 flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 text-accent-glow" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-text-primary mb-1">Workflow tip</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Save your model face in <strong className="text-text-primary font-medium">Assets</strong>, use reference posts from trends for scene/video, then batch through Face Copy and Face Swap for a consistent feed.
              </p>
              <p className="text-xs text-text-muted mt-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-accent-glow" />
                Video face swap needs Kaggle GPU tunnel in Settings.
              </p>
            </div>
          </div>
        </Card>
      </Section>
    </Root>
  )
}
