# Reproduction documentation

This document explains how to reproduce the website and its datasets from the original public sources. It distinguishes the normal offline rebuild from a full source refresh. A full refresh downloads the required public inputs, regenerates the historical geography and retrieves the Olympedia pages used for the direct-encounter analysis.





## 1\. Serve the website locally

The website is static: it has no JavaScript bundler or frontend compilation step. It must nevertheless be served through HTTP because the D3 modules fetch CSV and TopoJSON files.

On Windows, use the repository's existing script: start\_server.bat through Command Prompt or by simply double-clicking the file. It starts a local Python HHT server on a random available port and opens the website in the default browser.



\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

## 2\. What a full reconstruction produces

public source files
-> historical geography mapping and TopoJSON basemaps
-> cached-page Olympedia encounter dataset
-> shared intermediate datasets
-> chart-specific CSV files in data/final/



The website loads only the files in data/final/. The raw datasets and the intermediate files are not sent to the browser.



\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

## 3\. Obtain the source datasets

Create the following directories if they are absent:

* preprocessing/source/olympics/
* preprocessing/source/nuclear/
* preprocessing/source/geography/external\_sources/
* preprocessing/source/olympedia/
* 

Download the following files and retain the indicated filenames. The geographical inputs are version-pinned: their exact download URLs and SHA-256 checksums are recorded in preprocessing/source/geography/source\_manifest.json.

|Destination file|Public dataset|Role in the project|
|-|-|-|
|`preprocessing/source/olympics/120\\\\\\\\\\\\\\\_years\\\\\\\\\\\\\\\_of\\\\\\\\\\\\\\\_olympic\\\\\\\\\\\\\\\_history\\\\\\\\\\\\\\\_OG.csv`|[120 Years of Olympic History: Athletes and Results](https://www.kaggle.com/datasets/heesoo37/120-years-of-olympic-history-athletes-and-results)|Supplies the Summer Olympic `NOC × edition` participation universe, delegation labels, sports, events and medal records. For the geography crosswalk, only participation years and delegation labels are used.|
|`preprocessing/source/olympics/Olympic\\\\\\\\\\\\\\\_Athlete\\\\\\\\\\\\\\\_Event\\\\\\\\\\\\\\\_Results.csv`|[Joseph Chang's Olympedia scraping project](https://github.com/josephwccheng/olympedia_web_scraping/blob/main/data/Olympic_Athlete_Event_Results.csv)|Supplies athlete/event records and Olympedia `result\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_id` values used to identify candidate direct encounters.|
|`preprocessing/source/nuclear/nuclear-warhead-stockpiles-lines.csv`|[Our World in Data: nuclear warhead stockpiles](https://ourworldindata.org/grapher/nuclear-warhead-stockpiles-lines)|Supplies annual US and Soviet/Russian warhead estimates for the Arms Race chart.|
|`preprocessing/source/geography/external\\\\\\\\\\\\\\\_sources/cshapes\\\\\\\\\\\\\\\_2.0.tar.gz`|[CShapes 2.0](https://icr.ethz.ch/data/cshapes/), distributed through the [official CRAN package](https://cran.r-project.org/package=cshapes)|Supplies dated historical state entities and Gleditsch-Ward codes. The pipeline selects entities active on 1 July of each Olympic year.|
|`preprocessing/source/geography/external\\\\\\\\\\\\\\\_sources/countrycode\\\\\\\\\\\\\\\_codelist.csv`|[`countrycode` project](https://github.com/vincentarelbundock/countrycode)|Supplies country-name, IOC and Gleditsch-Ward code.|
|`preprocessing/source/geography/external\\\\\\\\\\\\\\\_sources/countries-c8015eeb.json`|[`mledoze/countries` project](https://github.com/mledoze/countries)|Supplies the `independent` flag used only when an IOC territory has no Gleditsch-Ward code.|

The normal and full builds depend on the exact geography snapshots named above. Do not replace them with newer versions without also updating `source\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_manifest.json` and intentionally accepting a new mapping output.

The script "fetch\_geography\_sources.py" automatically retrieves the last three sources.





\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

## 4\. Install the Python environment

#### 4.1 Install the chart and geographical build dependencies

* on bash: "python -m pip install -r preprocessing/requirements.txt -r preprocessing/source/geography/requirements.txt ipykernel"



#### 4.2 Install the scraper dependencies before rebuilding the Olympedia dataset

* on bash: "python -m pip install -r preprocessing/source/olympedia/requirements.txt"



\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

## 5\. Rebuild the historical geography

#### 5.1 Create olympic\_geography\_mapping.csv

1. The four sources below are used to build the mapping between year, NOC and Gleditsch-Ward code:
2. **/olympics/120\_years\_olympic\_history\_OG.csv** provides the Summer Olympic NOC × edition universe and delegation labels.
3. **CShapes 2.0** provides dated historical entities and Gleditsch-Ward codes.
4. **geography/countrycode.csv** provides the versioned country-name, IOC and Gleditsch-Ward concordance.
5. **geography/countries.json** provides the independent status only when an IOC territory has no Gleditsch-Ward code.



From the repository root, generate the mapping by running the following script:

* on bash: "python preprocessing/source/geography/build\_olympic\_geography\_mapping.py"



The script restricts the Olympic source to Summer editions from 1952 to 1988, resolves the historically active CShapes entity for each delegation and writes:

* its output is the file "preprocessing/source/geography/olympic\_geography\_mapping.csv"



#### 5.2 Create the historical TopoJSON basemaps

The map uses one CShapes state-boundary snapshot for every Olympic edition.

The R script "generate\_cshapes\_snapshots.R" selects entities active on each Olympic year, preserves only their Gleditsch-Ward identifiers, and converts the result to compact TopoJSON shapes.

Install the required R packages and the mapshaper command-line tool with:

* Rscript -e "install.packages(c('cshapes', 'sf'))"
npm install -g mapshaper



Then run, from the repository root:

* Rscript preprocessing/source/geography/generate\_cshapes\_snapshots.R



This writes the runtime final maps accessed at runtime, one for each year:

* data/final/geography/basemaps/cshapes-<year>.topo.json



\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

## 6\. Rebuild the Olympedia direct-encounter dataset

This section reconstructs the direct USA–USSR encounter dataset from public Olympedia result pages.



#### 6.1 Prerequisites

The scraper requires:

* the local Olympic\_Athlete\_Event\_Results.csv file downloaded in Section 3
* an Internet connection
* a Python environment activated as described above



#### 6.2 Install scraper dependencies

From the repository root, install the scraper-specific dependencies:

* on bash "python -m pip install -r preprocessing/source/olympedia/requirements.txt"



#### 6.3 Run the scraper

From the repository root, run on bash:

"

python preprocessing/source/olympedia/rivalry\_scraper.py run

\--input preprocessing/source/olympics/Olympic\_Athlete\_Event\_Results.csv

\--work-dir preprocessing/source/olympedia/output

\--cache-dir preprocessing/source/olympedia/cache

\--delay 4.5

\--max-retries 5

\--user-agent "Olympic-Cold-War-DataViz/1.0 (University project; contact: \[YOUR\_EMAIL])"

"



Replace YOUR\_EMAIL with a project email address before a run to notify Olympedia's administrators, OlyMADMen about the project and its purpose.

The command creates the output and cache directories if they do not already exist.



The downloader is deliberately slow and sequential. A four-second delay is enforced between requests in order to avoid HTTP 429 errors (Too Many Requests).

Therefore, it should not be parallelised or sped up.



#### 6.4 Main outputs



The two main outputs of the command are the following:

* preprocessing/source/olympedia/output/rivalry\_pulse\_candidates.csv
* preprocessing/source/olympedia/output/rivalry\_pulse\_matches.csv



rivalry\_pulse\_candidates.csv contains one candidate Olympedia result page per row. It is named "candidates" because it contains every page in which both USA and USSR appears. USA and USSR appearing in the same page does not by itself prove that they faced each other directly.



rivalry\_pulse\_matches.csv contains the parsed and validated literal USA–USSR pairings extracted from the candidate pages.





\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

## 7\. Build the intermediates and final chart datasets



#### 7.1 Prerequisites

First, install the dependencies:

* python -m pip install pandas numpy requests beautifulsoup4 nbformat nbconvert jupyter ipykernel



Also, make sure the geography mapping, TopoJSON files and Olympedia output already exist.



#### 7.2 Building the final datasets

Run the project orchestrator from the repository root:

* python preprocessing/build\_all.py



It verifies the generated geography mapping, copies the validated Olympedia output to preprocessing/intermediate/rivalry\_pulse\_matches.csv, builds preprocessing/intermediate/cold\_war\_olympic\_common.csv, and executes the seven chart notebooks.





#### 7.3 Outputs

The visualization-ready outputs are then written to:

* data/final/cold\_war/arms\_race.csv
* data/final/cold\_war/world\_stage.csv
* data/final/cold\_war/medal\_race.csv
* data/final/cold\_war/sporting\_fronts.csv
* data/final/cold\_war/rivalry\_pulse.csv
* data/final/cold\_war/who\_won.csv
* data/final/cold\_war/who\_won\_cumulative.csv





