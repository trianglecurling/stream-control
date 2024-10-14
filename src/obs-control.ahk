#Requires AutoHotkey v2.0

; This script is intended to be run several times in succession.
; The last execution should clean up everything.
#SingleInstance Off

currentPid := DllCall("GetCurrentProcessId")

; Secret bail-out hotkey, but it won't work when inputs are blocked.
Hotkey("^+!Esc", GracefulExit)

; The automation should never take longer than a minute. If it does, abort.
SetTimer(CancelScript, -60000)  ;

; Read the first and second inputs passed from Node.js or another script
warnTime := A_Args[1] ; if >0, show a warning instead of starting automation for the number of ms given
pid := A_Args[2]  ; PID of OBS instance to control
exitFlag := A_Args[3]  ; Whether or not to exit AHK when the script is done
streamTitle := A_Args[4]  ; First input parameter
streamDescription := A_Args[5] ; Second input parameter
testMode := A_Args[6] ; Test mode (do not actually start stream)

; Show the last chance to cancel modal
dimGui := CreateDimOverlay()
lastChanceToCancel := Gui()
if (warnTime > 0) {
    lastChanceToCancel.SetFont("s16")

    ; Add a text warning to the GUI
    lastChanceToCancel.Add("Text", "w400",
        "Heads-up! Starting livestreams in 10 seconds. Please wait..."
    )

    lastChanceToCancel.Opt("+AlwaysOnTop -Caption")

    ; Add a "Cancel" button to the GUI that will trigger the `CancelScript` function
    cancelButton := lastChanceToCancel.Add("Button", "", "Abort Livestream")
    cancelButton.OnEvent("Click", CancelScript)  ; Attach event handler for the button
    dimGui.Show("Maximize")
    WinSetTransColor("FAFAFA 150", "DIMOVERLAY") ; Color just has to not be black
    lastChanceToCancel.Show("AutoSize Center")

    ; Set a timer to run the automation script after 10 seconds
    SetTimer(CompleteScript, -warnTime)  ; -10000 means it will run once after 10 seconds
} else {
    CompleteScript()
}

CancelScript(*) {
    SetTimer(CompleteScript, 0)
    dimGui.Destroy()
    lastChanceToCancel.Destroy()
    GracefulExit(1)
}

; Function to run the script after the 10-second timer
CompleteScript(*) {
    lastChanceToCancel.Destroy()  ; Close the last chance dialog
    dimGui.Destroy()

    if (warnTime > 0) {
        ; Create a basic dialog to indicate automation is in progress
        automationInProgress := Gui("AlwaysOnTop", "Automation in progress")
        automationInProgress.SetFont("s16")
        automationInProgress.Opt("-Caption +AlwaysOnTop")
        automationInProgress.Add("Text", "w400", "Automation in progress. Starting streams...")
        automationInProgress.Add("Text", "w400",
            "Mouse and keyboard are disabled while automation is running. Inputs will be re-enabled in less than 1 minute."
        )
        automationInProgress.Show()

        if (testMode == 2) {
            BlockInput("On")
        }
    } else {

        ; Activate the OBS window
        if (ProcessExist(pid) != 0) {
            WinActivate("ahk_pid " pid)
        } else {
            WinActivate("ahk_exe obs64.exe")
        }
        Sleep(450)

        ; Press Escape in case any dialogs are showing in OBS
        Send("{Esc}")
        Sleep(250)

        ; Send Ctrl+Shift+Alt+Enter - this is set up as a hotkey in OBS to start streaming
        Send("^+!{Enter}")
        Sleep(100)

        ; Press Enter - continues past the "You need to set up a broadcast" dialog.
        Send("{Enter}")
        Sleep(1000)

        ; Tab twice - tabs to the stream title input
        Send("{Tab 2}")
        Sleep(100)

        ; Type the stream title
        SendText(streamTitle)
        Sleep(100)

        ; Tab once - tabs to the stream description
        Send("{Tab}")
        Sleep(100)

        ; Type the stream description
        SendText(streamDescription)
        Sleep(100)

        ; Tab once - tabs to the visibility dropdown
        Send("{Tab}")
        Sleep(100)

        ; Up-arrow to set visibility to public
        Send("{Up 2}")
        Sleep(100)

        ; Tab twice - tabs to the "Made for kids" radio group
        Send("{Tab 2}")
        Sleep(100)

        ; Space to ensure a radio button is selected
        Send("{Space}")
        Sleep(100)

        ; Up-arrow to set not made for kids
        Send("{Up 2}")
        Sleep(100)

        ; Tab 9 times - tabs to the create broadcast and start streaming button
        Send("{Tab 9}")
        Sleep(100)

        ; Press Enter - Press the button - done
        if (testMode = 0) {
            Send("{Enter}")
        }
        Sleep(100)

        ; The last execution of this script will flag to clean up the
        ; previous executions.
        if (exitFlag = 1) {
            GracefulExit(0)
        }
    }
}

; Function to get a list of all processes
ProcessList() {
    ProcessList := []
    for process in ComObjGet("winmgmts:").ExecQuery("Select * from Win32_Process") {
        ProcessList.Push({ Name: process.Name, PID: process.ProcessId
        })
    }
    return ProcessList
}

CreateDimOverlay() {
    ; Create a semi-transparent background (a second GUI window that covers the screen)
    dimGui := Gui("", "DIMOVERLAY")
    dimGui.BackColor := "000000"  ; Set background color to gray
    dimGui.Opt("+AlwaysOnTop +ToolWindow -Caption")  ; Remove title bar, keep it on top
    ;dimGui.Transparency := 150  ; Make the background semi-transparent (0 is fully opaque, 255 is invisible)
    return dimGui
}

GracefulExit(exitCode) {
    BlockInput("Off")

    ; Close all AHK processes
    for proc in ProcessList() {
        ; Check if the process name is "AutoHotkey.exe" or "AutoHotkey64.exe"
        if (proc.Name = "AutoHotkey.exe" or proc.Name = "AutoHotkey64.exe" or proc.Name = A_ScriptName) {
            ; Close the process gracefully by sending an exit message
            if (proc.PID != currentPid) {
                ProcessClose(proc.PID)
            }
        }
    }
    ExitApp(exitCode)
}

return