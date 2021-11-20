/*
 * Infringement Assistant
 *
 * This contains all the required functionality of CTE. As evident by the
 * array below, this file depends on a lot of things, so loading it is likely
 * going to be a bit tough. A loader can be used instead to optimize loading
 * times.
 *
 * More information on the userscript itself can be found at [[User:Chlod/IA]].
 */
// <nowiki>
mw.loader.using([
    "oojs-ui-core",
    "oojs-ui-windows",
    "oojs-ui-widgets",
    "oojs-ui.styles.icons-editing-core",
    "oojs-ui.styles.icons-editing-advanced",
    "oojs-ui.styles.icons-interactions",
    "mediawiki.util",
    "mediawiki.api",
    "mediawiki.Title"
], async function() {

    // =============================== STYLES =================================

    mw.util.addCSS(`
        .ia-submit {
            margin-left: auto;
            margin-top: 16px;
        }
    `);

    // ============================== CONSTANTS ===============================

    const advert = "([[User:Chlod/IA|InfringementAssistant]])";
    /**
     * Using a fixed set of months since `mw.language.months` changes depending
     * on `?uselang` even if we're still on the English Wikipedia.
     * @type {string[]}
     */
    const months = [
        "January", "February", "March", "April", "May", "June", "July",
        "August", "September", "October", "November", "December"
    ];

    // =========================== HELPER FUNCTIONS ===========================

    /**
     * Gets the title of today's copyright problems page.
     * @returns {string}
     */
    function getCopyrightProblemsPage() {
        return "User:Chlod/sandbox"; // TODO: Remove after debugging
        const today = new Date();
        return `Wikipedia:Copyright problems/${
            today.getUTCFullYear()
        } ${
            months[today.getUTCMonth()]
        } ${
            today.getUTCDate()
        }`
    }

    /**
     * Ask for confirmation before unloading.
     * @param {BeforeUnloadEvent} event
     */
    function exitBlock(event) {
        event.preventDefault();
        return event.returnValue = undefined;
    }

    /**
     * Converts a normal error into an OO.ui.Error for ProcessDialogs.
     * @param {Error} error A plain error object.
     * @param {Object} config Error configuration.
     * @param {boolean} config.recoverable Whether or not the error is recoverable.
     * @param {boolean} config.warning Whether or not the error is a warning.
     */
    function errorToOO(error, config) {
        new OO.ui.Error(error.message, config);
    }

    // ============================== SINGLETONS ==============================

    /**
     * The WindowManager for this userscript.
     */
    const windowManager = new OO.ui.WindowManager();
    document.body.appendChild(windowManager.$element[0]);

    /**
     * MediaWiki API class.
     * @type {mw.Api}
     */
    const api = new mw.Api();
    const pageName = mw.config.get("wgPageName");

    // =========================== PROCESS FUNCTIONS ==========================

    function shadowPage(options) {
        if (options.fullPage) {
            api.postWithEditToken({
                "action": "edit",
                "title": pageName,
                "prependtext": `{{subst:copyvio|url=${options.urls[0]}}`,
            });
        } else if (options.sections.length > 1) {
            api.postWithEditToken({
                "action": "edit",
                "title": pageName,
                "prependtext": `{{subst:copyvio|url=${options.urls[0]}}`,
            });
        }
    }

    // =============================== PANELS =================================

    function SuspectedInfringementPanel(config) {
        SuspectedInfringementPanel.super.call( this, name, config );

        this.inputs = {
            fullPage: new OO.ui.CheckboxInputWidget({ selected: true }),
            sections: new OO.ui.DropdownInputWidget({
                disabled: true,
                options: config.context["sections"].length > 0 ? config.context["sections"].map(
                    (d) => { return { data: d.index, label: `${d.number}: ${d.line}` }; }
                ) : null,
                placeholder: "Select section to hide"
            }),
            urls: new OO.ui.MenuTagMultiselectWidget({
                allowArbitrary: true,
                inputPosition: "outline",
                indicators: [ "required" ],
                placeholder: "Add URL",
                options: config.context["externallinks"].length > 0 ? config.context["externallinks"].map(
                    (d) => { return { data: d, label: d }; }
                ) : null
            }),
            additionalNotes: new OO.ui.MultilineTextInputWidget({
                autosize: true,
                maxRows: 2,
                classes: ["ia-additionalNotes"]
            })
        };
        this.fields = {
            fullPage: new OO.ui.FieldLayout(this.inputs.fullPage, {
                align: "inline",
                label: "Hide the entire page"
            }),
            sections: new OO.ui.FieldLayout(this.inputs.sections, {
                align: "top",
                label: "Section"
            }),
            urls: new OO.ui.FieldLayout(this.inputs.urls, {
                align: "top",
                label: "URL(s) to source of copied content"
            }),
            additionalNotes: new OO.ui.FieldLayout(this.inputs.additionalNotes, {
                align: "top",
                label: "Additional notes"
            })
        }

        this.inputs.fullPage.on("change", (selected) => {
            this.inputs.sections.setDisabled(selected);
        });
        this.inputs.urls.on("change", (items) => {
            for (const item of items) {
                if (!OO.ui.isSafeUrl(item.data)) {
                    this.fields.urls.setWarnings([
                        `"${item.data}" is not a valid URL. This will not be linked.`
                    ]);
                    return;
                }
            }
            this.fields.urls.setWarnings([]);
        });

        for (const field of Object.values(this.fields)) {
            /** @var $element */
            this.$element.append(field.$element);
        }

        const submit = new OO.ui.ButtonWidget({
            label: "Submit",
            flags: [ "primary", "progressive" ],
            classes: [ "ia-submit" ]
        });
        const submitContainer = document.createElement("div");
        submitContainer.style.textAlign = "right";
        submitContainer.appendChild(submit.$element[0]);

        /** @var $element */
        this.$element.append(submitContainer);
    }
    OO.inheritClass(SuspectedInfringementPanel, OO.ui.TabPanelLayout);
    SuspectedInfringementPanel.prototype.setupTabItem = function () {
        /** @var tabItem */
        this.tabItem.setLabel("Suspected or complicated");
    };

    // =============================== DIALOGS ================================

    function InfringementAssistantDialog(config) {
        InfringementAssistantDialog.super.call(this, config);
        if (config.context == null)
            throw "Context was not provided.";
        else
            this.context = config.context;
    }
    OO.inheritClass(InfringementAssistantDialog, OO.ui.ProcessDialog);

    InfringementAssistantDialog.static.name = "infringementAssistantDialog";
    InfringementAssistantDialog.static.title = "Infringement Assistant";
    InfringementAssistantDialog.static.size = "medium";
    InfringementAssistantDialog.static.actions = [
        {
            flags: ["safe", "close"],
            icon: "close",
            label: "Close",
            title: "Close",
            invisibleLabel: true,
            action: "close"
        }
    ];

    // noinspection JSUnusedGlobalSymbols
    InfringementAssistantDialog.prototype.getBodyHeight = function () {
        return 425;
    };

    InfringementAssistantDialog.prototype.initialize = function () {
        InfringementAssistantDialog.super.prototype.initialize.apply(this, arguments);

        this.indexLayout = new OO.ui.IndexLayout({
            expanded: true
        });
        this.panelLayout = new OO.ui.PanelLayout({
            expanded: true,
            framed: true,
            content: [ this.indexLayout ]
        });

        this.indexLayout.addTabPanels([
            (this.suspectedPanel = new SuspectedInfringementPanel({ context: this.context }))
        ]);

        /** @var $content */
        this.$body.append(this.panelLayout.$element);
    }

    InfringementAssistantDialog.prototype.getSetupProcess = function (data) {
        const process = InfringementAssistantDialog.super.prototype.getSetupProcess.call(this, data);

        process.next(() => {
            window.addEventListener("beforeunload", exitBlock);
        });

        return process;
    }

    InfringementAssistantDialog.prototype.getActionProcess = function (action) {
        const process = InfringementAssistantDialog.super.prototype.getActionProcess.call(this, action);

        process.next(function () {
            if (action === "close") {
                this.close({ action: action });
            }
        }, this);

        return process;
    }

    InfringementAssistantDialog.prototype.getTeardownProcess = function (data) {
        window.removeEventListener("beforeunload", exitBlock);
        /** @var any */
        return InfringementAssistantDialog.super.prototype.getTeardownProcess.call(this, data);
    }

    // ============================== INITIALIZE ==============================

    function openDialog() {
        api.get({
            "action": "parse",
            "page": pageName,
            "prop": "externallinks|sections"
        }).then((data) => {
            const dialog = new InfringementAssistantDialog({
                context: data["parse"]
            });
            windowManager.addWindows([ dialog ]);
            windowManager.openWindow(dialog);
        }).catch((error) => {
            if (error === "missingtitle")
                OO.ui.alert("Cannot open Infringement Assistant: The page does not exist.");
            else
                OO.ui.alert(`Cannot open Infringement Assistant: ${error}`);
        });
    }

    window.InfringementAssistant = {
        openDialog: openDialog,
        InfringementAssistantDialog: InfringementAssistantDialog
    }

    if (document.getElementById("pt-ia") == null && mw.config.get("wgNamespaceNumber") >= 0) {
        mw.util.addPortletLink(
            "p-tb",
            "javascript:void(0)",
            "Infringement Assistant",
            "pt-ia"
        ).addEventListener("click", function() {
            openDialog();
        });
    }

    // Query parameter-based autostart
    if (/[?&]ia-autostart(=(1|yes|true|on)?(&|$)|$)/.test(window.location.search)) {
        openDialog();
    }

    document.dispatchEvent(new Event("ia:load"));

});
// </nowiki>
/*
 * Copyright 2021 Chlod
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Also licensed under the Creative Commons Attribution-ShareAlike 3.0
 * Unported License, a copy of which is available at
 *
 *     https://creativecommons.org/licenses/by-sa/3.0
 *
 */