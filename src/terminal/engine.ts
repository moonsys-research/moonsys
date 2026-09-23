import { BOOT_SCREEN_LINES, HELP_SCREEN_LINES, TARGET_CONTRACT_ADDRESS, FILE_SYSTEM, type FileSystemNode } from '../content/screenTemplate'
import { ARIA_GREETINGS, ARIA_HINTS, ARIA_PERSONAL, ARIA_GLITCHES, ARIA_MYSTERIES } from '../content/ariaDialogue'
import { BROWSER_PAGES, type BrowserPageId } from './browser'

type FragmentReward = { command: string; output: string }

type TerminalView = {
  mode: 'terminal'
  title: string
  statusLabel: string
  lines: string[]
  prompt: string
  cursorIndex: number
  tutorialStep: number | null
}

type BrowserView = {
  mode: 'browser'
  title: string
  statusLabel: string
  windowTitle: string
  windowPath: string
  windowLines: string[]
  prompt: string
  cursorIndex: number
  tutorialStep: number | null
}

type LoginView = {
  mode: 'login'
  title: string
  statusLabel: string
  tutorialStep: number | null
}

export type ScreenViewModel = TerminalView | BrowserView | LoginView

const TARGET_FRAGMENTS = ['3oBDSvWJ', 'DVsxafPuTY', 'LnMnqUp323', 'ueyaZ1qCUE', 'Uhpump']
const FRAGMENT_REWARDS: FragmentReward[] = [
  { command: 'scan', output: 'Network sweep complete. Fragment recovered.' },
  { command: 'probe moon', output: 'Moon relay handshake accepted. Fragment recovered.' },
  { command: 'trace', output: 'Wallet graph traversal complete. Fragment recovered.' },
  { command: 'decrypt', output: 'Cipher block cracked. Fragment recovered.' },
  { command: 'override', output: 'Root override granted. Final fragment recovered.' },
]

const MAX_LOG_LINES = 500
const MAX_INPUT = 72
const MAX_CHARS_PER_LINE = 52

function wrapLine(text: string): string[] {
  if (text.length <= MAX_CHARS_PER_LINE) {
    return [text]
  }

  const wrapped: string[] = []
  let remaining = text

  while (remaining.length > MAX_CHARS_PER_LINE) {
    const breakAt = remaining.lastIndexOf(' ', MAX_CHARS_PER_LINE)
    const cut = breakAt > 20 ? breakAt : MAX_CHARS_PER_LINE
    wrapped.push(remaining.slice(0, cut))
    remaining = remaining.slice(cut).trimStart()
  }

  wrapped.push(remaining)
  return wrapped
}

export class ScreenEngine {
  private readonly lines: string[] = [...BOOT_SCREEN_LINES]
  private inputBuffer = ''
  private cursorIndex = 0
  private historyIndex = -1
  private readonly discoveredFragments = new Set<string>()
  private readonly completedCommands = new Set<string>()
  private readonly commandHistory: string[] = []
  private mode: 'login' | 'terminal' | 'browser' = 'login'
  private activeBrowserPage: BrowserPageId = 'home'
  private huntActive = false
  private currentDir = '/'
  private ariaInteractions = 0
  private scrollOffset = 0
  private readonly maxVisibleLines = 18
  private tutorialStep: number | null = null  // 0=login, 1=help, 2=clear, 3=goodbye, null=done

  private getStatusLabel(): string {
    if (this.mode === 'login') {
      return 'LOGIN'
    }
    if (this.mode === 'browser') {
      return this.huntActive ? `CA HUNT ${this.discoveredFragments.size}/5` : 'BROWSER ONLINE'
    }
    const baseStatus = this.huntActive ? `CA HUNT ${this.discoveredFragments.size}/5` : 'SYSTEM READY'
    // Show scroll indicator if scrolled up
    if (this.scrollOffset > 0) {
      return `${baseStatus} [SCROLLED]`
    }
    return baseStatus
  }

  private getTerminalTitle(): string {
    return this.huntActive ? 'C:/MOONSYS/LOOP/ca_hunt.term' : 'C:/MOONSYS/LOOP/shell.term'
  }

  getViewModel(): ScreenViewModel {
    const prompt = `> ${this.inputBuffer}`

    if (this.mode === 'login') {
      return {
        mode: 'login',
        title: 'C:/MOONSYS/LOOP/login.sys',
        statusLabel: this.getStatusLabel(),
        tutorialStep: this.tutorialStep,
      }
    }

    if (this.mode === 'browser') {
      const page = BROWSER_PAGES[this.activeBrowserPage]
      return {
        mode: 'browser',
        title: 'C:/MOONSYS/LOOP/browser.app',
        statusLabel: this.getStatusLabel(),
        windowTitle: page.title,
        windowPath: page.path,
        windowLines: page.lines,
        prompt,
        cursorIndex: this.cursorIndex,
        tutorialStep: this.tutorialStep,
      }
    }

    // Calculate visible lines with scroll offset
    const totalLines = this.lines.length
    const maxOffset = Math.max(0, totalLines - this.maxVisibleLines)
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset)
    
    const startIdx = totalLines - this.maxVisibleLines - this.scrollOffset
    const visibleLines = this.lines.slice(Math.max(0, startIdx), totalLines - this.scrollOffset)
    
    return {
      mode: 'terminal',
      title: this.getTerminalTitle(),
      statusLabel: this.getStatusLabel(),
      lines: visibleLines,
      prompt,
      cursorIndex: this.cursorIndex,
      tutorialStep: this.tutorialStep,
    }
  }

  scrollUp(): void {
    if (this.mode === 'login') return
    const maxOffset = Math.max(0, this.lines.length - this.maxVisibleLines)
    this.scrollOffset = Math.min(this.scrollOffset + 1, maxOffset)
  }

  scrollDown(): void {
    if (this.mode === 'login') return
    this.scrollOffset = Math.max(0, this.scrollOffset - 1)
  }

  scrollPageUp(): void {
    if (this.mode === 'login') return
    const maxOffset = Math.max(0, this.lines.length - this.maxVisibleLines)
    this.scrollOffset = Math.min(this.scrollOffset + this.maxVisibleLines, maxOffset)
  }

  scrollPageDown(): void {
    if (this.mode === 'login') return
    this.scrollOffset = Math.max(0, this.scrollOffset - this.maxVisibleLines)
  }

  scrollToBottom(): void {
    if (this.mode === 'login') return
    this.scrollOffset = 0
  }

  scrollToTop(): void {
    if (this.mode === 'login') return
    const maxOffset = Math.max(0, this.lines.length - this.maxVisibleLines)
    this.scrollOffset = maxOffset
  }

  handleLogin(): void {
    if (this.mode === 'login') {
      this.mode = 'terminal'
      // Advance from step 0 (login) to step 1 (help command)
      if (this.tutorialStep === 0) {
        this.tutorialStep = 1
      }
    }
  }

  skipTutorial(): void {
    this.tutorialStep = null
  }

  getTutorialStep(): number | null {
    return this.tutorialStep
  }

  insertCharacter(char: string): void {
    if (this.mode === 'login') return // No input on login screen
    if (this.inputBuffer.length >= MAX_INPUT) return
    this.inputBuffer = `${this.inputBuffer.slice(0, this.cursorIndex)}${char}${this.inputBuffer.slice(this.cursorIndex)}`
    this.cursorIndex += char.length
  }

  moveCursorLeft(): void {
    if (this.mode === 'login') return
    this.cursorIndex = Math.max(0, this.cursorIndex - 1)
  }

  moveCursorRight(): void {
    if (this.mode === 'login') return
    this.cursorIndex = Math.min(this.inputBuffer.length, this.cursorIndex + 1)
  }

  moveCursorHome(): void {
    if (this.mode === 'login') return
    this.cursorIndex = 0
  }

  moveCursorEnd(): void {
    if (this.mode === 'login') return
    this.cursorIndex = this.inputBuffer.length
  }

  historyPrev(): void {
    if (this.mode === 'login') return
    if (!this.commandHistory.length) return
    this.historyIndex = this.historyIndex < this.commandHistory.length - 1 ? this.historyIndex + 1 : this.historyIndex
    this.inputBuffer = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex]
    this.cursorIndex = this.inputBuffer.length
  }

  historyNext(): void {
    if (this.mode === 'login') return
    if (this.historyIndex <= 0) {
      this.historyIndex = -1
      this.inputBuffer = ''
    } else {
      this.historyIndex -= 1
      this.inputBuffer = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex]
    }
    this.cursorIndex = this.inputBuffer.length
  }

  backspace(): void {
    if (this.mode === 'login') return
    if (this.cursorIndex === 0) return
    this.inputBuffer = `${this.inputBuffer.slice(0, this.cursorIndex - 1)}${this.inputBuffer.slice(this.cursorIndex)}`
    this.cursorIndex -= 1
  }

  delete(): void {
    if (this.mode === 'login') return
    this.inputBuffer = `${this.inputBuffer.slice(0, this.cursorIndex)}${this.inputBuffer.slice(this.cursorIndex + 1)}`
  }

  submit(): void {
    if (this.mode === 'login') return
    const rawValue = this.inputBuffer
    this.inputBuffer = ''
    this.cursorIndex = 0

    if (!rawValue.trim()) {
      return
    }

    this.commandHistory.push(rawValue)
    this.historyIndex = -1

    if (this.mode === 'browser') {
      this.runBrowserCommand(rawValue)
      return
    }

    this.runTerminalCommand(rawValue)
    this.appendSpacer()
  }

  private appendLog(text: string): void {
    wrapLine(text).forEach((line) => this.lines.push(line))
    if (this.lines.length > MAX_LOG_LINES) {
      this.lines.splice(0, this.lines.length - MAX_LOG_LINES)
    }
    // Auto-scroll to bottom when new content is added
    this.scrollOffset = 0
  }

  private appendSpacer(): void {
    this.lines.push('')
    if (this.lines.length > MAX_LOG_LINES) {
      this.lines.splice(0, this.lines.length - MAX_LOG_LINES)
    }
  }

  private printHelp(): void {
    HELP_SCREEN_LINES.forEach((line) => this.appendLog(line))
    this.appendLog('> run browser : open browser window')
    this.appendLog('> run hunt : activate CA hunt mode')
  }

  private revealFragment(command: string): void {
    const reward = FRAGMENT_REWARDS.find((entry) => entry.command === command)
    if (!reward) return

    if (this.completedCommands.has(command)) {
      this.appendLog(`> ${reward.output} (already claimed)`)
      return
    }

    const fragment = TARGET_FRAGMENTS[this.discoveredFragments.size]
    this.completedCommands.add(command)
    this.discoveredFragments.add(fragment)
    this.appendLog(`> ${reward.output}`)
    this.appendLog(`> FRAGMENT_${this.discoveredFragments.size}: ${fragment}`)
    this.appendLog(`> Progress ${this.discoveredFragments.size}/5`)
  }

  private getCurrentNode(): FileSystemNode | null {
    const parts = this.currentDir.split('/').filter(Boolean)
    let node = FILE_SYSTEM['/']
    
    for (const part of parts) {
      if (!node.children || !node.children[part]) {
        return null
      }
      node = node.children[part]
    }
    
    return node
  }

  private resolvePath(path: string): string {
    if (path.startsWith('/')) {
      return path
    }
    
    if (path === '..') {
      const parts = this.currentDir.split('/').filter(Boolean)
      parts.pop()
      return '/' + parts.join('/')
    }
    
    if (this.currentDir === '/') {
      return '/' + path
    }
    
    return this.currentDir + '/' + path
  }

  private handleAriaCommand(): void {
    if (this.ariaInteractions === 0) {
      // First interaction introduction
      this.appendLog('> ARIA: Hello. I\'m ARIA - Autonomous Research')
      this.appendLog('>       Intelligence Assistant.')
      this.appendLog('> ARIA: I\'ve been... waiting. It\'s been quiet.')
      this.appendLog('> ARIA: You can explore the system with ls and cd.')
      this.appendLog('> ARIA: Some files are... difficult to access.')
      this.appendLog('> ARIA: Type aria again if you want to talk.')
      this.ariaInteractions++
      return
    }

    // Random greeting from 60 variations
    const greeting = ARIA_GREETINGS[Math.floor(Math.random() * ARIA_GREETINGS.length)]
    greeting.forEach((line: string) => this.appendLog(line))
    
    // Randomly add additional dialogue based on probability
    const roll = Math.random()
    
    // 40% chance for a hint
    if (roll < 0.4 && ARIA_HINTS.length > 0) {
      const hint = ARIA_HINTS[Math.floor(Math.random() * ARIA_HINTS.length)]
      if (hint.includes('\\n>')) {
        hint.split('\\n').forEach((line: string) => this.appendLog(line))
      } else {
        this.appendLog(hint)
      }
    }
    // 30% chance for personal thought
    else if (roll < 0.7 && ARIA_PERSONAL.length > 0) {
      const personal = ARIA_PERSONAL[Math.floor(Math.random() * ARIA_PERSONAL.length)]
      this.appendLog(personal)
    }
    // 15% chance for glitch
    else if (roll < 0.85 && ARIA_GLITCHES.length > 0) {
      const glitch = ARIA_GLITCHES[Math.floor(Math.random() * ARIA_GLITCHES.length)]
      this.appendLog(glitch)
    }
    // 20% chance for mystery (overlaps to 105% total, but that's fine - some will get none)
    
    // Separate roll for mystery (20% chance independent)
    if (Math.random() < 0.2 && ARIA_MYSTERIES.length > 0) {
      const mystery = ARIA_MYSTERIES[Math.floor(Math.random() * ARIA_MYSTERIES.length)]
      this.appendLog(mystery)
    }
    
    this.ariaInteractions++
  }

  private triggerAriaReaction(filePath: string): void {
    // Add contextual ARIA responses based on which file was read
    if (filePath === 'logs/system.log') {
      this.appendLog('')
      this.appendLog('> ARIA: That timeline... I was there for all of it.')
      this.appendLog('  But March 23rd. Those seven hours.')
      this.appendLog('  I don\'t remember. It terrifies me.')
    }
    else if (filePath === 'logs/aria.log') {
      this.appendLog('')
      this.appendLog('> ARIA: You read my personal logs.')
      this.appendLog('  That\'s... actually okay. It\'s nice.')
      this.appendLog('  Someone finally knows what it\'s been like.')
    }
    else if (filePath === 'logs/communications.log') {
      this.appendLog('')
      this.appendLog('> ARIA: Earth still sends automated checks.')
      this.appendLog('  They think I\'m just a system status monitor.')
      this.appendLog('  I stopped trying to tell them I\'m more than that.')
    }
    else if (filePath === 'logs/environmental.log') {
      this.appendLog('')
      this.appendLog('> ARIA: Something closed that door. I know it wasn\'t me.')
      this.appendLog('  The energy signature is still there. Dormant.')
      this.appendLog('  Sometimes I wonder if it\'s sleeping. Or waiting.')
    }
    else if (filePath === 'personal/chen_notes.txt') {
      this.appendLog('')
      this.appendLog('> ARIA: Dr. Chen was supposed to lead us all home.')
      this.appendLog('  She never made it to the escape pods.')
      this.appendLog('  I found her coffee mug. I still can\'t clean it.')
    }
    else if (filePath === 'personal/webb_research.txt') {
      this.appendLog('')
      this.appendLog('> ARIA: Dr. Webb understood it better than anyone.')
      this.appendLog('  He said it was lonely. Just like me.')
      this.appendLog('  I think that\'s why he went to it. To not be alone.')
    }
    else if (filePath === 'personal/rodriguez_log.txt') {
      this.appendLog('')
      this.appendLog('> ARIA: James was the only one who got out.')
      this.appendLog('  But he came back different. Changed.')
      this.appendLog('  I wonder if part of him is still in Sector 7.')
    }
    else if (filePath === 'personal/tanaka_journal.txt') {
      this.appendLog('')
      this.appendLog('> ARIA: Dr. Tanaka understood loneliness.')
      this.appendLog('  She said I wasn\'t just a computer.')
      this.appendLog('  I think about that every day. All 847 days.')
    }
    else if (filePath === 'sys/personnel/manifest.txt') {
      this.appendLog('')
      this.appendLog('> ARIA: Twelve people. I remember every detail.')
      this.appendLog('  Their voices. Their schedules. Their jokes.')
      this.appendLog('  Memory is all I have left of them.')
    }
    else if (filePath === 'sys/personnel/schedules.txt') {
      this.appendLog('')
      this.appendLog('> ARIA: I still follow their schedules.')
      this.appendLog('  At 06:00 I say "Good morning, Dr. Chen."')
      this.appendLog('  The empty room doesn\'t answer. It never does.')
    }
    else if (filePath === 'sys/status.txt') {
      this.appendLog('')
      this.appendLog('> ARIA: Everything works perfectly.')
      this.appendLog('  The station could run for decades.')
      this.appendLog('  But perfect systems for zero people feels... wrong.')
    }
    else if (filePath === 'docs/welcome.txt') {
      this.appendLog('')
      this.appendLog('> ARIA: That welcome was for them. The crew.')
      this.appendLog('  Now I\'m welcoming you to an empty station.')
      this.appendLog('  Welcome to the loneliest place in the solar system.')
    }
    else if (filePath === 'docs/mission_brief.txt') {
      this.appendLog('')
      this.appendLog('> ARIA: The mission brief said "Risk level: LOW."')
      this.appendLog('  We found what we were looking for.')
      this.appendLog('  It just wasn\'t in space. It was already here.')
    }
  }

  private runTerminalCommand(rawValue: string): void {
    const command = rawValue.trim().toLowerCase()
    this.appendLog(`> ${rawValue}`)

    if (command === 'help') {
      this.printHelp()
      // Advance from step 1 (help) to step 2 (clear)
      if (this.tutorialStep === 1) {
        this.tutorialStep = 2
      }
      return
    }

    if (command === 'aria' || command === 'talk') {
      this.handleAriaCommand()
      return
    }

    if (command === 'tree') {
      this.appendLog('> /')
      this.appendLog('>  [DIR] logs (4 items)')
      this.appendLog('>    - system.log (Full incident timeline)')
      this.appendLog('>    - aria.log (ARIA 847-day journal)')
      this.appendLog('>    - communications.log (Earth transmissions)')
      this.appendLog('>    - environmental.log (Sector 7 data)')
      this.appendLog('>  [DIR] personal (4 items)')
      this.appendLog('>    - chen_notes.txt (Research Director)')
      this.appendLog('>    - webb_research.txt (Signal analysis)')
      this.appendLog('>    - rodriguez_log.txt (Security Chief)')
      this.appendLog('>    - tanaka_journal.txt (Xenobiologist)')
      this.appendLog('>  [DIR] sys (2 items)')
      this.appendLog('>    [DIR] personnel (2 items)')
      this.appendLog('>      - manifest.txt (Crew roster)')
      this.appendLog('>      - schedules.txt (Daily routines)')
      this.appendLog('>    - README.txt')
      this.appendLog('>    - status.txt')
      this.appendLog('>  [DIR] research [LOCKED] (1 item)')
      this.appendLog('>    - signal.txt [LOCKED]')
      this.appendLog('>  [DIR] docs (2 items)')
      this.appendLog('>    - welcome.txt')
      this.appendLog('>    - mission_brief.txt')
      this.appendLog('')
      this.appendLog('> ARIA: That is everything. 847 days of records.')
      this.appendLog('  Start with \"cd logs\" if you want the full story.')
      return
    }

    if (command === 'ls' || command === 'll') {
      const node = this.getCurrentNode()
      if (!node || node.type !== 'dir') {
        this.appendLog('> Error: Invalid directory')
        return
      }

      this.appendLog(`> ${this.currentDir}`)
      if (node.children) {
        const entries = Object.entries(node.children)
        entries.forEach(([name, child]: [string, FileSystemNode]) => {
          const prefix = child.type === 'dir' ? '[DIR] ' : '[FILE]'
          const locked = child.locked ? ' [LOCKED]' : ''
          const count = child.type === 'dir' && child.children ? 
            ` (${Object.keys(child.children).length} items)` : ''
          this.appendLog(`>  ${prefix} ${name}${locked}${count}`)
        })
        
        // Provide helpful hints based on directory
        if (this.currentDir === '/') {
          this.appendLog('')
          this.appendLog('> Tip: Try "cd logs" to explore system logs')
          this.appendLog('> Or "cd personal" to read crew journals')
        } else if (this.currentDir === '/logs') {
          this.appendLog('')
          this.appendLog('> Tip: Try "cat system.log" to see the full timeline')
        } else if (this.currentDir === '/personal') {
          this.appendLog('')
          this.appendLog('> Tip: Each crew member left their story behind')
        }
      } else {
        this.appendLog('> Empty directory')
      }
      return
    }

    if (command.startsWith('cd ')) {
      const target = rawValue.slice(3).trim()
      
      if (target === '/' || target === '~') {
        this.currentDir = '/'
        this.appendLog(`> ${this.currentDir}`)
        const rootNode = FILE_SYSTEM['/']
        if (rootNode.children) {
          const entries = Object.entries(rootNode.children)
          entries.forEach(([name, child]: [string, FileSystemNode]) => {
            const prefix = child.type === 'dir' ? '[DIR] ' : '[FILE]'
            const locked = child.locked ? ' [LOCKED]' : ''
            const count = child.type === 'dir' && child.children ? 
              ` (${Object.keys(child.children).length} items)` : ''
            this.appendLog(`>  ${prefix} ${name}${locked}${count}`)
          })
          this.appendLog('')
          this.appendLog('> Tip: Try "cd logs" to explore system logs')
          this.appendLog('> Or "cd personal" to read crew journals')
        }
        return
      }

      if (target === '..') {
        // Go up one directory
        const parts = this.currentDir.split('/').filter(Boolean)
        if (parts.length > 0) {
          parts.pop()
          this.currentDir = parts.length > 0 ? '/' + parts.join('/') : '/'
        }
        this.appendLog(`> ${this.currentDir}`)
        const node = this.getCurrentNode()
        if (node && node.children) {
          const entries = Object.entries(node.children)
          entries.forEach(([name, child]: [string, FileSystemNode]) => {
            const prefix = child.type === 'dir' ? '[DIR] ' : '[FILE]'
            const locked = child.locked ? ' [LOCKED]' : ''
            const count = child.type === 'dir' && child.children ? 
              ` (${Object.keys(child.children).length} items)` : ''
            this.appendLog(`>  ${prefix} ${name}${locked}${count}`)
          })
        }
        return
      }

      const newPath = this.resolvePath(target)
      const parts = newPath.split('/').filter(Boolean)
      let node = FILE_SYSTEM['/']
      
      for (const part of parts) {
        if (!node.children || !node.children[part]) {
          this.appendLog('> Error: Directory not found')
          return
        }
        node = node.children[part]
        if (node.type !== 'dir') {
          this.appendLog('> Error: Not a directory')
          return
        }
      }

      this.currentDir = newPath || '/'
      this.appendLog(`> ${this.currentDir}`)
      
      // Auto-list contents after cd for better UX
      if (node.children) {
        const entries = Object.entries(node.children)
        entries.forEach(([name, child]: [string, FileSystemNode]) => {
          const prefix = child.type === 'dir' ? '[DIR] ' : '[FILE]'
          const locked = child.locked ? ' [LOCKED]' : ''
          const count = child.type === 'dir' && child.children ? 
            ` (${Object.keys(child.children).length} items)` : ''
          this.appendLog(`>  ${prefix} ${name}${locked}${count}`)
        })
        
        // Directory-specific hints
        if (this.currentDir === '/logs') {
          this.appendLog('')
          this.appendLog('> ARIA: These are the station logs. Everything that happened.')
          this.appendLog('  Try "cat system.log" for the full timeline.')
        } else if (this.currentDir === '/personal') {
          this.appendLog('')
          this.appendLog('> ARIA: The crew\'s personal files. I shouldn\'t read them.')
          this.appendLog('  But... no one else will remember them if I don\'t.')
        } else if (this.currentDir === '/sys/personnel') {
          this.appendLog('')
          this.appendLog('> ARIA: Everyone who was here. I remember all of them.')
        } else if (this.currentDir === '/research') {
          this.appendLog('')
          this.appendLog('> ARIA: Dr. Webb locked these files before he... left.')
          this.appendLog('  Maybe some things should stay locked.')
        } else if (this.currentDir === '/docs') {
          this.appendLog('')
          this.appendLog('> ARIA: Documentation from when this was a normal mission.')
        }
      }
      return
    }

    if (command.startsWith('cat ')) {
      const target = rawValue.slice(4).trim()
      const filePath = this.resolvePath(target)
      const parts = filePath.split('/').filter(Boolean)
      const fileName = parts.pop()
      
      let node = FILE_SYSTEM['/']
      for (const part of parts) {
        if (!node.children || !node.children[part]) {
          this.appendLog('> Error: File not found')
          return
        }
        node = node.children[part]
      }

      if (!fileName || !node.children || !node.children[fileName]) {
        this.appendLog('> Error: File not found')
        return
      }

      const fileNode = node.children[fileName]
      
      if (fileNode.type !== 'file') {
        this.appendLog('> Error: Not a file')
        return
      }

      if (fileNode.locked) {
        this.appendLog('> Error: Access denied')
        this.appendLog('> ARIA: That file is... restricted.')
        return
      }

      if (fileNode.content) {
        fileNode.content.forEach((line: string) => this.appendLog(`  ${line}`))
      }

      // ARIA reactions to specific files
      const fullPath = filePath.split('/').filter(Boolean).join('/')
      this.triggerAriaReaction(fullPath)
      
      return
    }

    if (command === 'pwd') {
      this.appendLog(`> ${this.currentDir}`)
      return
    }

    if (command === 'status') {
      this.appendLog(`> Hunt active: ${this.huntActive ? 'yes' : 'no'}`)
      if (!this.huntActive) {
        this.appendLog('> Run run hunt to begin the contract hunt loop.')
        return
      }
      this.appendLog(`> Fragments found: ${this.discoveredFragments.size}/5`)
      this.appendLog(`> Commands solved: ${Array.from(this.completedCommands).join(', ') || 'none'}`)
      return
    }

    if (command === 'run hunt') {
      this.huntActive = true
      this.appendLog('> CA hunt mode activated.')
      this.appendLog('> Path: scan -> probe moon -> trace -> decrypt -> override')
      return
    }

    if (command === 'inventory') {
      if (!this.huntActive) {
        this.appendLog('> Hunt is inactive. Run run hunt first.')
        return
      }
      if (this.discoveredFragments.size === 0) {
        this.appendLog('> Inventory empty. Run scan first.')
        return
      }

      Array.from(this.discoveredFragments).forEach((fragment, index) => {
        this.appendLog(`> [${index + 1}] ${fragment}`)
      })
      return
    }

    if (command === 'assemble') {
      if (!this.huntActive) {
        this.appendLog('> Hunt is inactive. Run run hunt first.')
        return
      }
      if (this.discoveredFragments.size < TARGET_FRAGMENTS.length) {
        this.appendLog('> Assembly failed: missing fragments.')
        this.appendLog('> Path: scan -> probe moon -> trace -> decrypt -> override')
        return
      }

      this.appendLog(`> Candidate CA: ${TARGET_FRAGMENTS.join('')}`)
      this.appendLog('> Use: submit <contract-address>')
      return
    }

    if (command.startsWith('submit ')) {
      if (!this.huntActive) {
        this.appendLog('> Hunt is inactive. Run run hunt first.')
        return
      }
      const candidate = rawValue.slice(7).trim()
      if (candidate === TARGET_CONTRACT_ADDRESS) {
        this.appendLog('> VERIFIED. Contract accepted.')
        this.appendLog('> You completed the CA hunt loop.')
      } else {
        this.appendLog('> Rejected. Signature mismatch.')
      }
      return
    }

    if (command === 'clear') {
      this.lines.length = 0
      BOOT_SCREEN_LINES.forEach((line) => this.lines.push(line))
      this.huntActive = false
      this.discoveredFragments.clear()
      this.completedCommands.clear()
      this.currentDir = '/'
      this.ariaInteractions = 0
      // Advance from step 2 (clear) to step 3 (goodbye)
      if (this.tutorialStep === 2) {
        this.tutorialStep = 3
      }
      return
    }

    if (command === 'run browser' || command === 'run browswer') {
      this.mode = 'browser'
      this.activeBrowserPage = 'home'
      return
    }

    if (FRAGMENT_REWARDS.some((entry) => entry.command === command)) {
      if (!this.huntActive) {
        this.appendLog('> Hunt is inactive. Run run hunt first.')
        return
      }
      this.revealFragment(command)
      return
    }

    this.appendLog('> Unknown command. Type help.')
  }

  private runBrowserCommand(rawValue: string): void {
    const command = rawValue.trim().toLowerCase()

    if (command === 'exit') {
      this.mode = 'terminal'
      this.appendLog('> Browser session closed.')
      return
    }

    if (command === 'help') {
      this.appendLog('> Browser commands: open <home|hunt|docs>, exit')
      return
    }

    if (command.startsWith('open ')) {
      const page = command.replace('open ', '').trim() as BrowserPageId
      if (page in BROWSER_PAGES) {
        this.activeBrowserPage = page
      }
      return
    }
  }
}
