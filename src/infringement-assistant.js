/*
 * Infringement Assistant
 *
 * More information on the userscript itself can be found at [[User:Chlod/IA]].
 */
// <nowiki>
mw.loader.using([
    "oojs-ui-core",
    "oojs-ui-windows",
    "oojs-ui-widgets",
    "mediawiki.api",
    "mediawiki.util"
], async function() {

    // =============================== STYLES =================================

    mw.util.addCSS(`
        .ia-submit {
            margin-left: auto;
            margin-top: 16px;
        }
    `);

    // ============================== CONSTANTS ===============================

    /**
     * Debug mode will redirect CP listings to Special:MyPage/sandbox/{date} and
     * replace the copyvio template with a soft link (using {{T}}).
     * @type {boolean}
     */
    const debug = true;

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

    function getListingDate() {
        const today = new Date();
        return `${
            today.getUTCFullYear()
        } ${
            months[today.getUTCMonth()]
        } ${
            today.getUTCDate()
        }`;
    }

    /**
     * Gets the title of today's copyright problems page.
     * @returns {string}
     */
    function getListingPage() {
        return (debug ? `User:${mw.config.get("wgUserName")}/sandbox/` : "Wikipedia:Copyright problems/")
            + getListingDate();
    }

    /**
     * Ask for confirmation before unloading.
     * @param {BeforeUnloadEvent} event
     */
    function exitBlock(event) {
        event.preventDefault();
        return event.returnValue = undefined;
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
    const pageName = mw.config.get("wgPageName").replace(/_/g, " ");

    // =========================== PROCESS FUNCTIONS ==========================

    async function shadowPage(options) {
        let summary = `Hiding ${
            options.fullPage ? "the page" : `/* ${options.sectionName} */`
        } due to a suspected/complicated copyright violation (see [[${
            getListingPage()}#${pageName
        }]]) ${
            advert
        }`;

        if (options.fullPage) {
            return api.postWithEditToken({
                action: "edit",
                title: pageName,
                prependtext: `{{${debug ? "T|" : ""}subst:copyvio|${options.fromText}|fullpage=yes}}\n`,
                nocreate: true,
                summary: summary
            });
        } else if (options.section) {
            return api.postWithEditToken({
                action: "edit",
                title: pageName,
                section: options.section,
                prependtext: `{{${debug ? "T|" : ""}subst:copyvio|${options.fromText}}}\n`,
                appendtext: `\n{{${debug ? "T|" : ""}Copyvio/bottom}}`,
                nocreate: true,
                summary: summary
            });
        } else {
            throw "Illegal state.";
        }
    }

    async function addListing(options) {
        const listingPage = getListingPage();
        const pageExists = (await api.get({
            "action": "query",
            "titles": listingPage
        }))["query"]["pages"]["-1"] == null;

        let summary = `${
            pageExists ? "A" : "Created page and a"
        }dded listing for [[${
            pageName
        }${
            !options.fullPage && options.sectionName ? `#${options.sectionName}|${pageName} § ${
                options.sectionName
            }` : ""
        }]] ${
            advert
        }`;

        const listingText = `\n* {{subst:article-cv|${pageName}}} from ${
            options.fromText
        }.${
            options.additionalNotes ? ` ${options.additionalNotes}` : ""
        } ~~~~`;

        if (pageExists) {
            return api.postWithEditToken({
                action: "edit",
                title: listingPage,
                appendtext: listingText,
                recreate: true,
                summary: summary
            });
        } else {
            const listingHeader = `==== [[${listingPage}|${getListingDate()}]] ====\n`;
            return api.postWithEditToken({
                action: "edit",
                title: listingPage,
                text: `${listingHeader}${listingText}`,
                recreate: true,
                summary: summary
            });
        }
    }

    // =============================== PANELS =================================

    function SuspectedInfringementPanel(config) {
        SuspectedInfringementPanel.super.call( this, name, config );

        this.inputs = {
            fullPage: new OO.ui.CheckboxInputWidget({ selected: true }),
            section: new OO.ui.DropdownInputWidget({
                disabled: true,
                options: config.context["sections"].length > 0 ? [
                    { data: "0", label: "0: Lead" },
                    ...config.context["sections"].map(
                        (d) => { return { data: d.index, label: `${d.number}: ${d.line}` }; }
                    )
                ] : null,
                placeholder: "Select section to hide"
            }),
            fromURL: new OO.ui.CheckboxInputWidget({ selected: true }),
            urls: new OO.ui.MenuTagMultiselectWidget({
                allowArbitrary: true,
                inputPosition: "outline",
                indicators: [ "required" ],
                placeholder: "Add URL",
                options: config.context["externallinks"].length > 0 ? config.context["externallinks"].map(
                    (d) => { return { data: d, label: d }; }
                ) : null
            }),
            rawFrom: new OO.ui.MultilineTextInputWidget({
                autosize: true,
                maxRows: 2
            }),
            additionalNotes: new OO.ui.MultilineTextInputWidget({
                autosize: true,
                maxRows: 2
            })
        };
        this.fields = {
            fullPage: new OO.ui.FieldLayout(this.inputs.fullPage, {
                align: "inline",
                label: "Hide the entire page"
            }),
            section: new OO.ui.FieldLayout(this.inputs.section, {
                align: "top",
                label: "Section"
            }),
            fromURL: new OO.ui.FieldLayout(this.inputs.fromURL, {
                $overlay: config.dialog.$overlay,
                align: "inline",
                label: "Use URLs for the origin",
                help: "URLs will automatically be wrapped with brackets to shorten the external link. " +
                    "Disabling this option will present the text as is."
            }),
            urls: new OO.ui.FieldLayout(this.inputs.urls, {
                align: "top",
                label: "Source of copied content"
            }),
            rawFrom: new OO.ui.FieldLayout(this.inputs.rawFrom, {
                align: "top",
                label: "Source of copied content"
            }),
            additionalNotes: new OO.ui.FieldLayout(this.inputs.additionalNotes, {
                align: "top",
                label: "Additional notes"
            })
        }

        this.fields.rawFrom.toggle(false);

        this.inputs.fromURL.on("change", (selected) => {
            this.fields.rawFrom.toggle(!selected);
            this.fields.urls.toggle(selected);
        });

        this.inputs.fullPage.on("change", (selected) => {
            this.inputs.section.setDisabled(selected);
        });

        this.urls = [];
        this.inputs.urls.on("change", (items) => {
            this.urls = items.map(i => i.data);
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

        submit.on("click", () => {
            const panel = this;
            config.dialog.setCompletionFunction(async () => {
                const options = {
                    fullPage: panel.inputs.fullPage.isSelected(),
                    additionalNotes: panel.inputs.additionalNotes.getValue()
                };
                if (!options.fullPage) {
                    options.section = +panel.inputs.section.getValue();
                    options.sectionName = panel.inputs.section.dropdownWidget.label.replace(/^[0-9.]+: /g, "");
                }
                if (panel.inputs.fromURL.isSelected()) {
                    options.urls = panel.urls;
                    options.fromText = panel.urls.map(u => `[${
                        encodeURI(u)
                    }]`).join(", ")
                } else {
                    options.fromText = panel.inputs.rawFrom.getValue();
                }
                return addListing(options).then(() => shadowPage(options));
            });
            config.dialog.executeAction("execute");
        });

        /** @var $element */
        this.$element.append(submitContainer);
    }
    OO.inheritClass(SuspectedInfringementPanel, OO.ui.TabPanelLayout);
    // noinspection JSUnusedGlobalSymbols
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
        return 470;
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
            new SuspectedInfringementPanel({
                dialog: this,
                context: this.context
            })
        ]);

        /** @var $content */
        this.$body.append(this.panelLayout.$element);
    }

    InfringementAssistantDialog.prototype.setCompletionFunction = function (process) {
        this.completionFunction = process;
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

        if (action === "execute") {
            process.first(this.completionFunction);
        }
        process.next(function () {
            this.close({ action: action });
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

    if (debug) {
        mw.notify("Debug mode has been enabled.", { title: "Infringement Assistant" });
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
