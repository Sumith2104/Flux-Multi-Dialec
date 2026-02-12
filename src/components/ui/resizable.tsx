"use client"

import { GripVertical } from "lucide-react"
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels"
import { createContext, useContext } from "react"
import { cn } from "@/lib/utils"

const ResizablePanelGroupContext = createContext<{ direction: "horizontal" | "vertical" }>({
  direction: "horizontal",
})

const ResizablePanelGroup = ({
  className,
  direction = "horizontal",
  ...props
}: React.ComponentProps<typeof PanelGroup> & { direction?: "horizontal" | "vertical" }) => (
  <ResizablePanelGroupContext.Provider value={{ direction }}>
    <PanelGroup
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className
      )}
      data-panel-group-direction={direction}
      orientation={direction}
      {...props}
    />
  </ResizablePanelGroupContext.Provider>
)

const ResizablePanel = Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof PanelResizeHandle> & {
  withHandle?: boolean
}) => {
  const { direction } = useContext(ResizablePanelGroupContext)

  return (
    <PanelResizeHandle
      className={cn(
        "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90",
        className
      )}
      data-panel-group-direction={direction}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
          <GripVertical className="h-2.5 w-2.5" />
        </div>
      )}
    </PanelResizeHandle>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
